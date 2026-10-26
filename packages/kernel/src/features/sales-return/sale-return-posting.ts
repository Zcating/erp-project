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
import { ValidationError } from "../../shared/errors/index.js";
import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document } from "../documents/model.js";
import type { DocumentRepository } from "../documents/ports.js";
import type { StockBalance, StockLedgerEntry } from "../inventory/model.js";
import type { StockBalanceKey, StockLedgerRepository } from "../inventory/ports.js";
import type { InventoryMovement, PostingDirection, PostingTypeHandler } from "../posting/model.js";

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

  const validate = async (document: Document): Promise<void> => {
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

  const allocatedOf = (basis: OriginalCostBasis, cumulativeText: string): Amount =>
    amount(
      toFixedString(
        basis.cost.times(quantity(cumulativeText)).dividedBy(basis.quantity),
        AMOUNT_SCALE,
      ),
    );

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
    const cumulatives = new Map<string, string>();
    const movements: InventoryMovement[] = [];

    for (const line of document.lines) {
      const originalLineId = line.originalLineId as string;
      let basis = bases.get(originalLineId);
      if (basis === undefined) {
        basis = await costBasisOf(originalLineId, transaction);
        bases.set(originalLineId, basis);
        cumulatives.set(
          originalLineId,
          await documents.sumPostedReturnedQuantity(originalLineId, transaction),
        );
      }
      const previousText = cumulatives.get(originalLineId) as string;
      const previous = quantity(previousText);
      const returned = quantity(line.quantity);
      const cumulative = previous.plus(returned);
      if (cumulative.greaterThan(basis.quantity)) {
        const excess = cumulative.minus(basis.quantity);
        throw new ValidationError(
          `销售退货单 ${document.documentNo} 第 ${line.lineNo} 行超退 ${toFixedString(excess, QUANTITY_SCALE)}：` +
            `累计退货 ${toFixedString(cumulative, QUANTITY_SCALE)} 超过原单据 ${basis.documentNo} 第 ${basis.lineNo} 行已过账数量 ${toFixedString(basis.quantity, QUANTITY_SCALE)}`,
        );
      }
      const cumulativeText = toFixedString(cumulative, QUANTITY_SCALE);
      cumulatives.set(originalLineId, cumulativeText);

      const allocation = allocatedOf(basis, cumulativeText).minus(allocatedOf(basis, previousText));
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
    const entries = await ledger.listEntriesByDocument(document.id, transaction);
    const original = entries.filter((entry) => entry.direction === "POST");
    const movements: InventoryMovement[] = [];
    for (const entry of [...original].reverse()) {
      const key = { warehouseId: entry.warehouseId, itemId: entry.itemId };
      const locked = await ledger.findBalancesForUpdate([key], transaction);
      const before = locked[0] ?? emptyBalance(key);
      const delta = quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore));
      const afterQuantity = toFixedString(quantity(before.quantity).minus(delta), QUANTITY_SCALE);
      const afterCost = reversedUnitCost(before, afterQuantity, entry.amount);
      await ledger.saveBalance(
        {
          warehouseId: key.warehouseId,
          itemId: key.itemId,
          quantity: afterQuantity,
          unitCost: afterCost,
        },
        transaction,
      );
      movements.push({
        lineNo: entry.lineNo,
        warehouseId: key.warehouseId,
        itemId: key.itemId,
        quantityDelta: toFixedString(delta.negated(), QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: afterQuantity,
        costBefore: before.unitCost,
        costAfter: afterCost,
        unitPrice: entry.unitPrice,
        amount: toFixedString(amount(entry.amount).negated(), AMOUNT_SCALE),
      });
    }
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
    validate: async (document) => validate(document),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedger(document, movements, direction),
  };
}

function reversedUnitCost(
  before: StockBalance,
  afterQuantityText: string,
  removedAmountText: string,
): string {
  const afterQuantity = quantity(afterQuantityText);
  if (afterQuantity.isZero()) {
    return toFixedString(unitPrice("0"), UNIT_PRICE_SCALE);
  }
  const remainingValue = quantity(before.quantity)
    .times(unitPrice(before.unitCost))
    .minus(amount(removedAmountText));
  return toFixedString(remainingValue.dividedBy(afterQuantity), UNIT_PRICE_SCALE);
}
