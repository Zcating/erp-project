import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amount,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-inventory-sales/shared";
import type { Amount, Quantity } from "@erp-inventory-sales/shared";
import { ValidationError } from "../../shared/errors";
import type { TransactionContext } from "../../shared/transactions";
import type { Document, DocumentRepository } from "../documents";
import type {
  StockBalance,
  StockBalanceKey,
  StockLedgerEntry,
  StockLedgerRepository,
} from "../inventory";
import { reverseDocumentPostings } from "../posting";
import type { InventoryMovement, PostingDirection, PostingTypeHandler } from "../posting";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

type OriginalCostBasis = {
  documentNo: string;
  lineNo: number;
  quantity: Quantity;
  cost: Amount;
};

export function createSaleReturnPostingHandler(
  ledger: StockLedgerRepository,
  documents: DocumentRepository,
): PostingTypeHandler {
  const balanceKey = (key: StockBalanceKey): string => `${key.warehouseId}::${key.itemId}`;

  const uniqueKeys = (keys: StockBalanceKey[]): StockBalanceKey[] => {
    const seen = new Set<string>();
    const result: StockBalanceKey[] = [];
    for (const key of keys) {
      const identifier = balanceKey(key);
      if (seen.has(identifier)) {
        continue;
      }
      seen.add(identifier);
      result.push(key);
    }
    return result;
  };

  const emptyBalance = (key: StockBalanceKey): StockBalance => ({
    warehouseId: key.warehouseId,
    itemId: key.itemId,
    quantity: EMPTY_QUANTITY,
    unitCost: EMPTY_UNIT_COST,
  });

  const validate = async (
    document: Document,
    direction: PostingDirection,
    context?: TransactionContext,
  ): Promise<void> => {
    if (document.sourceWarehouseId === null) {
      throw new ValidationError("销售退货单缺少仓库，不能过账");
    }
    if (document.lines.length === 0) {
      throw new ValidationError("销售退货单没有单据行，不能过账");
    }
    document.lines.forEach((line) => {
      if (line.originalLineId === null) {
        throw new ValidationError(`第 ${line.lineNo} 行缺少原单据行引用，不能过账`);
      }
      if (!quantity(line.quantity).greaterThan(0)) {
        throw new ValidationError(`第 ${line.lineNo} 行数量必须大于 0：${line.quantity}`);
      }
    });
    if (direction !== "FORWARD") {
      return;
    }
    for (const line of document.lines) {
      await lockOriginalDocument(line.originalLineId as string, context);
    }
  };

  const lockOriginalDocument = async (
    originalLineId: string,
    context: TransactionContext | undefined,
  ): Promise<Document> => {
    const original = await documents.findByLineIdForUpdate(originalLineId, context);
    if (original === null) {
      throw new ValidationError(`引用的原单据行不存在：${originalLineId}`);
    }
    if (original.type !== "SALE_OUTBOUND") {
      throw new ValidationError(`引用的原单据行不是销售出库单的行：${original.documentNo}`);
    }
    if (original.status !== "POSTED") {
      throw new ValidationError(`引用的原单据行尚未过账：${original.documentNo}`);
    }
    return original;
  };

  const costBasisOf = async (
    originalLineId: string,
    context: TransactionContext | undefined,
  ): Promise<OriginalCostBasis> => {
    const original = await documents.findByLineId(originalLineId, context);
    if (original === null) {
      throw new ValidationError(`引用的原单据行不存在：${originalLineId}`);
    }
    if (original.type !== "SALE_OUTBOUND") {
      throw new ValidationError(`引用的原单据行不是销售出库单的行：${original.documentNo}`);
    }
    if (original.status !== "POSTED") {
      throw new ValidationError(`引用的原单据行尚未过账：${original.documentNo}`);
    }
    const line = original.lines.find((candidate) => candidate.id === originalLineId);
    if (line === undefined) {
      throw new ValidationError(`引用的原单据行不存在：${originalLineId}`);
    }
    const entries = await ledger.listEntriesByDocument(original.id, context);
    const posted = entries.find(
      (entry) => entry.lineNo === line.lineNo && entry.direction === "POST",
    );
    if (posted === undefined) {
      throw new ValidationError(
        `原单据行没有结转成本，无法回冲：${original.documentNo} 第 ${line.lineNo} 行`,
      );
    }
    return {
      documentNo: original.documentNo,
      lineNo: line.lineNo,
      quantity: quantity(line.quantity),
      cost: amount(posted.amount),
    };
  };

  const netReturnedSummaryOf = async (
    originalLineId: string,
    context: TransactionContext | undefined,
  ): Promise<{ quantity: Quantity; amount: Amount }> => {
    const references = await documents.listReturnLineReferences(originalLineId, context);
    let netQuantity = quantity("0.000");
    let netAmount = amount("0");
    for (const reference of references) {
      const entries = await ledger.listEntriesByDocument(reference.documentId, context);
      for (const entry of entries) {
        if (entry.lineNo !== reference.lineNo) {
          continue;
        }
        const delta = quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore));
        netQuantity = quantity(toFixedString(netQuantity.plus(delta), QUANTITY_SCALE));
        netAmount = amount(toFixedString(netAmount.plus(amount(entry.amount)), AMOUNT_SCALE));
      }
    }
    return { quantity: netQuantity, amount: netAmount };
  };

  const applyForward = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const warehouseId = document.sourceWarehouseId as string;
    const keys = uniqueKeys(document.lines.map((line) => ({ warehouseId, itemId: line.itemId })));
    await ledger.ensureBalances(keys, transaction);
    const locked = await ledger.findBalancesForUpdate(keys, transaction);
    const balances = new Map<string, StockBalance>();
    for (const key of keys) {
      const found = locked.find(
        (balance) => balance.warehouseId === key.warehouseId && balance.itemId === key.itemId,
      );
      balances.set(balanceKey(key), found ?? emptyBalance(key));
    }

    const bases = new Map<string, OriginalCostBasis>();
    const netQuantities = new Map<string, Quantity>();
    const netAllocated = new Map<string, Amount>();
    const movements: InventoryMovement[] = [];

    for (const line of document.lines) {
      const originalLineId = line.originalLineId as string;
      let basis = bases.get(originalLineId);
      if (basis === undefined) {
        basis = await costBasisOf(originalLineId, transaction);
        bases.set(originalLineId, basis);
        const prior = await netReturnedSummaryOf(originalLineId, transaction);
        netQuantities.set(originalLineId, prior.quantity);
        netAllocated.set(originalLineId, prior.amount);
      }
      const previousQuantity = netQuantities.get(originalLineId) as Quantity;
      const previousAllocated = netAllocated.get(originalLineId) as Amount;
      const returned = quantity(line.quantity);
      const cumulative = quantity(toFixedString(previousQuantity.plus(returned), QUANTITY_SCALE));
      if (cumulative.greaterThan(basis.quantity)) {
        const excess = cumulative.minus(basis.quantity);
        throw new ValidationError(
          `销售退货单 ${document.documentNo} 第 ${line.lineNo} 行超退 ${toFixedString(excess, QUANTITY_SCALE)}：` +
            `累计退货 ${toFixedString(cumulative, QUANTITY_SCALE)} 超过原单据 ${basis.documentNo} 第 ${basis.lineNo} 行已过账数量 ${toFixedString(basis.quantity, QUANTITY_SCALE)}`,
        );
      }
      const target = amount(
        toFixedString(basis.cost.times(cumulative).dividedBy(basis.quantity), AMOUNT_SCALE),
      );
      netQuantities.set(originalLineId, cumulative);
      netAllocated.set(originalLineId, target);
      const allocation = target.minus(previousAllocated);
      const allocationText = toFixedString(allocation, AMOUNT_SCALE);
      const allocationValue = amount(allocationText);
      const unitPriceText = toFixedString(allocationValue.dividedBy(returned), UNIT_PRICE_SCALE);

      const key = { warehouseId, itemId: line.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const afterQuantity = quantity(before.quantity).plus(returned);
      const valueBefore = quantity(before.quantity).times(unitPrice(before.unitCost));
      const valueAfter = valueBefore.plus(allocationValue);
      const afterCost = toFixedString(valueAfter.dividedBy(afterQuantity), UNIT_PRICE_SCALE);
      const afterQuantityText = toFixedString(afterQuantity, QUANTITY_SCALE);

      await ledger.saveBalance(
        { warehouseId, itemId: line.itemId, quantity: afterQuantityText, unitCost: afterCost },
        transaction,
      );
      balances.set(balanceKey(key), {
        warehouseId,
        itemId: line.itemId,
        quantity: afterQuantityText,
        unitCost: afterCost,
      });
      movements.push({
        lineNo: line.lineNo,
        warehouseId,
        itemId: line.itemId,
        quantityDelta: toFixedString(returned, QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: afterQuantityText,
        costBefore: before.unitCost,
        costAfter: afterCost,
        unitPrice: unitPriceText,
        amount: allocationText,
      });
    }
    return movements;
  };

  const applyReverse = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const movements = await reverseDocumentPostings(document.id, ledger, transaction);
    return movements.sort((left, right) => left.lineNo - right.lineNo);
  };

  const buildLedger = async (
    document: Document,
    movements: InventoryMovement[],
    direction: PostingDirection,
  ): Promise<StockLedgerEntry[]> =>
    movements.map((movement) => ({
      documentId: document.id,
      documentNo: document.documentNo,
      lineNo: movement.lineNo,
      warehouseId: movement.warehouseId,
      itemId: movement.itemId,
      direction: direction === "FORWARD" ? "POST" : "REVERSAL",
      quantityBefore: movement.quantityBefore,
      quantityAfter: movement.quantityAfter,
      costBefore: movement.costBefore,
      costAfter: movement.costAfter,
      unitPrice: movement.unitPrice,
      amount: movement.amount,
    }));

  return {
    type: "SALE_RETURN",
    validate: async (document, direction, transaction) =>
      validate(document, direction, transaction),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedger(document, movements, direction),
  };
}
