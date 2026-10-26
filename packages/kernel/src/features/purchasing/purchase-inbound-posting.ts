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
import { ValidationError } from "../../shared/errors/index.js";
import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document } from "../documents/model.js";
import { weightedAverageUnitCost } from "../inventory/costing.js";
import type { StockBalance, StockLedgerEntry } from "../inventory/model.js";
import type { StockBalanceKey, StockLedgerRepository } from "../inventory/ports.js";
import type { InventoryMovement, PostingTypeHandler } from "../posting/model.js";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

export function createPurchaseInboundPostingHandler(
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

  const validate = async (document: Document): Promise<void> => {
    if (document.targetWarehouseId === null) {
      throw new ValidationError("采购入库单缺少目标仓库，不能过账");
    }
    if (document.lines.length === 0) {
      throw new ValidationError("采购入库单没有单据行，不能过账");
    }
    document.lines.forEach((line) => {
      if (line.unitPrice === null) {
        throw new ValidationError(`第 ${line.lineNo} 行缺少单价，不能过账`);
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
    const warehouseId = document.targetWarehouseId as string;
    const keys = uniqueKeys(document.lines.map((line) => ({ warehouseId, itemId: line.itemId })));
    await ledger.ensureBalances(keys, transaction);
    const locked = await ledger.findBalancesForUpdate(keys, transaction);
    const balances = new Map<string, StockBalance>();
    for (const key of keys) {
      const found = locked.find(
        (balance) => balance.warehouseId === key.warehouseId && balance.itemId === key.itemId,
      );
      balances.set(
        balanceKey(key),
        found ?? {
          warehouseId: key.warehouseId,
          itemId: key.itemId,
          quantity: EMPTY_QUANTITY,
          unitCost: EMPTY_UNIT_COST,
        },
      );
    }

    const movements: InventoryMovement[] = [];
    for (const line of document.lines) {
      const key = { warehouseId, itemId: line.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const incomingQuantity = quantity(line.quantity);
      const incomingPrice = unitPrice(line.unitPrice ?? "0");
      const afterQuantity = quantity(before.quantity).plus(incomingQuantity);
      const afterCost = weightedAverageUnitCost(
        before.quantity,
        before.unitCost,
        line.quantity,
        line.unitPrice ?? "0",
      );
      await ledger.saveBalance(
        {
          warehouseId,
          itemId: line.itemId,
          quantity: toFixedString(afterQuantity, QUANTITY_SCALE),
          unitCost: afterCost,
        },
        transaction,
      );
      movements.push({
        lineNo: line.lineNo,
        warehouseId,
        itemId: line.itemId,
        quantityDelta: toFixedString(incomingQuantity, QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: toFixedString(afterQuantity, QUANTITY_SCALE),
        costBefore: before.unitCost,
        costAfter: afterCost,
        unitPrice: toFixedString(incomingPrice, UNIT_PRICE_SCALE),
        amount: toFixedString(amountOf(incomingQuantity, incomingPrice), AMOUNT_SCALE),
      });
      balances.set(balanceKey(key), {
        warehouseId,
        itemId: line.itemId,
        quantity: toFixedString(afterQuantity, QUANTITY_SCALE),
        unitCost: afterCost,
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
      const before = locked[0] ?? {
        warehouseId: key.warehouseId,
        itemId: key.itemId,
        quantity: EMPTY_QUANTITY,
        unitCost: EMPTY_UNIT_COST,
      };
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
    direction: "FORWARD" | "REVERSE",
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
    type: "PURCHASE_INBOUND",
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
