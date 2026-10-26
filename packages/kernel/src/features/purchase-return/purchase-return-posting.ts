import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-inventory-sales/shared";
import type { Quantity } from "@erp-inventory-sales/shared";
import { StockNegativeError, ValidationError } from "../../shared/errors";
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

type OriginalLineBasis = {
  documentNo: string;
  lineNo: number;
  quantity: Quantity;
};

export function createPurchaseReturnPostingHandler(
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
      throw new ValidationError("采购退货单缺少仓库，不能过账");
    }
    if (document.lines.length === 0) {
      throw new ValidationError("采购退货单没有单据行，不能过账");
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

  const originalLineBasisOf = async (
    originalLineId: string,
    context: TransactionContext | undefined,
  ): Promise<OriginalLineBasis> => {
    const original = await documents.findByLineId(originalLineId, context);
    if (original === null) {
      throw new ValidationError(`引用的原单据行不存在：${originalLineId}`);
    }
    if (original.type !== "PURCHASE_INBOUND") {
      throw new ValidationError(`引用的原单据行不是采购入库单的行：${original.documentNo}`);
    }
    if (original.status !== "POSTED") {
      throw new ValidationError(`引用的原单据行尚未过账：${original.documentNo}`);
    }
    const line = original.lines.find((candidate) => candidate.id === originalLineId);
    if (line === undefined) {
      throw new ValidationError(`引用的原单据行不存在：${originalLineId}`);
    }
    return {
      documentNo: original.documentNo,
      lineNo: line.lineNo,
      quantity: quantity(line.quantity),
    };
  };

  const applyForward = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const warehouseId = document.sourceWarehouseId as string;
    const keys = uniqueKeys(document.lines.map((line) => ({ warehouseId, itemId: line.itemId })));
    const locked = await ledger.findBalancesForUpdate(keys, transaction);
    const balances = new Map<string, StockBalance>();
    for (const key of keys) {
      const found = locked.find(
        (balance) => balance.warehouseId === key.warehouseId && balance.itemId === key.itemId,
      );
      balances.set(balanceKey(key), found ?? emptyBalance(key));
    }

    const bases = new Map<string, OriginalLineBasis>();
    const cumulatives = new Map<string, string>();
    const movements: InventoryMovement[] = [];

    for (const line of document.lines) {
      const originalLineId = line.originalLineId as string;
      let basis = bases.get(originalLineId);
      if (basis === undefined) {
        basis = await originalLineBasisOf(originalLineId, transaction);
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
          `采购退货单 ${document.documentNo} 第 ${line.lineNo} 行超退 ${toFixedString(excess, QUANTITY_SCALE)}：` +
            `累计退货 ${toFixedString(cumulative, QUANTITY_SCALE)} 超过原单据 ${basis.documentNo} 第 ${basis.lineNo} 行已过账数量 ${toFixedString(basis.quantity, QUANTITY_SCALE)}`,
        );
      }
      cumulatives.set(originalLineId, toFixedString(cumulative, QUANTITY_SCALE));

      const key = { warehouseId, itemId: line.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const afterQuantity = quantity(before.quantity).minus(returned);
      if (afterQuantity.isNegative()) {
        throw new StockNegativeError(
          `采购退货单 ${document.documentNo} 第 ${line.lineNo} 行退货后账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
        );
      }
      const costUnitPrice = unitPrice(before.unitCost);
      const afterQuantityText = toFixedString(afterQuantity, QUANTITY_SCALE);
      movements.push({
        lineNo: line.lineNo,
        warehouseId,
        itemId: line.itemId,
        quantityDelta: toFixedString(returned.negated(), QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: afterQuantityText,
        costBefore: before.unitCost,
        costAfter: before.unitCost,
        unitPrice: toFixedString(costUnitPrice, UNIT_PRICE_SCALE),
        amount: toFixedString(amountOf(returned, costUnitPrice), AMOUNT_SCALE),
      });
      balances.set(balanceKey(key), {
        warehouseId,
        itemId: line.itemId,
        quantity: afterQuantityText,
        unitCost: before.unitCost,
      });
    }

    for (const balance of balances.values()) {
      await ledger.saveBalance(balance, transaction);
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
    type: "PURCHASE_RETURN",
    validate: async (document) => validate(document),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedger(document, movements, direction),
  };
}
