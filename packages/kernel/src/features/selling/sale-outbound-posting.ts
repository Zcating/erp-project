import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amount,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-inventory-sales/shared";
import { StockNegativeError, ValidationError } from "../../shared/errors/index.js";
import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document } from "../documents/model.js";
import type { StockBalance, StockLedgerEntry } from "../inventory/model.js";
import type { StockBalanceKey, StockLedgerRepository } from "../inventory/ports.js";
import type { InventoryMovement, PostingDirection, PostingTypeHandler } from "../posting/model.js";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

export function createSaleOutboundPostingHandler(
  ledger: StockLedgerRepository,
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
      throw new ValidationError("销售出库单缺少来源仓库，不能过账");
    }
    if (document.lines.length === 0) {
      throw new ValidationError("销售出库单没有单据行，不能过账");
    }
    document.lines.forEach((line) => {
      if (line.unitPrice === null) {
        throw new ValidationError(`第 ${line.lineNo} 行缺少售价，不能过账`);
      }
      if (!quantity(line.quantity).greaterThan(0)) {
        throw new ValidationError(`第 ${line.lineNo} 行数量必须大于 0：${line.quantity}`);
      }
    });
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

    const movements: InventoryMovement[] = [];
    for (const line of document.lines) {
      const key = { warehouseId, itemId: line.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const outboundQuantity = quantity(line.quantity);
      const afterQuantity = quantity(before.quantity).minus(outboundQuantity);
      if (afterQuantity.isNegative()) {
        throw new StockNegativeError(
          `销售出库单 ${document.documentNo} 第 ${line.lineNo} 行出库后账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
        );
      }
      const costUnitPrice = unitPrice(before.unitCost);
      movements.push({
        lineNo: line.lineNo,
        warehouseId,
        itemId: line.itemId,
        quantityDelta: toFixedString(outboundQuantity.negated(), QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: toFixedString(afterQuantity, QUANTITY_SCALE),
        costBefore: before.unitCost,
        costAfter: before.unitCost,
        unitPrice: toFixedString(costUnitPrice, UNIT_PRICE_SCALE),
        amount: toFixedString(amountOf(outboundQuantity, costUnitPrice), AMOUNT_SCALE),
      });
      balances.set(balanceKey(key), {
        warehouseId,
        itemId: line.itemId,
        quantity: toFixedString(afterQuantity, QUANTITY_SCALE),
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
    const entries = await ledger.listEntriesByDocument(document.id, transaction);
    const original = entries.filter((entry) => entry.direction === "POST");
    const movements: InventoryMovement[] = [];
    for (const entry of [...original].reverse()) {
      const key = { warehouseId: entry.warehouseId, itemId: entry.itemId };
      const locked = await ledger.findBalancesForUpdate([key], transaction);
      const before = locked[0] ?? emptyBalance(key);
      const delta = quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore));
      const afterQuantity = toFixedString(quantity(before.quantity).minus(delta), QUANTITY_SCALE);
      await ledger.saveBalance(
        {
          warehouseId: key.warehouseId,
          itemId: key.itemId,
          quantity: afterQuantity,
          unitCost: before.unitCost,
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
        costAfter: before.unitCost,
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
    type: "SALE_OUTBOUND",
    validate: async (document) => validate(document),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedger(document, movements, direction),
  };
}
