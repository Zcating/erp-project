import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-inventory-sales/shared";
import { StockNegativeError, ValidationError } from "../../shared/errors/index.js";
import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document } from "../documents/index.js";
import { weightedAverageUnitCost } from "../inventory/index.js";
import type {
  StockBalance,
  StockBalanceKey,
  StockLedgerEntry,
  StockLedgerRepository,
} from "../inventory/index.js";
import { reverseDocumentPostings } from "../posting/index.js";
import type { InventoryMovement, PostingDirection, PostingTypeHandler } from "../posting/index.js";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

export function createStocktakePostingHandler(ledger: StockLedgerRepository): PostingTypeHandler {
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
    if (document.warehouseId === null) {
      throw new ValidationError("盘点单缺少仓库，不能过账");
    }
    if (document.lines.length === 0) {
      throw new ValidationError("盘点单没有单据行，不能过账");
    }
  };

  const applyForward = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const warehouseId = document.warehouseId as string;
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

    const movements: InventoryMovement[] = [];
    const changed = new Map<string, StockBalance>();
    for (const line of document.lines) {
      const key = { warehouseId, itemId: line.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const difference = quantity(line.quantity).minus(quantity(before.quantity));
      if (difference.isZero()) {
        continue;
      }
      const afterQuantity = quantity(before.quantity).plus(difference);
      if (afterQuantity.isNegative()) {
        throw new StockNegativeError(
          `盘点单 ${document.documentNo} 第 ${line.lineNo} 行盘亏后账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
        );
      }
      const costUnitPrice = unitPrice(before.unitCost);
      const afterCost = difference.isPositive()
        ? weightedAverageUnitCost(
            before.quantity,
            before.unitCost,
            toFixedString(difference, QUANTITY_SCALE),
            toFixedString(costUnitPrice, UNIT_PRICE_SCALE),
          )
        : before.unitCost;
      const movedQuantity = quantity(toFixedString(difference.abs(), QUANTITY_SCALE));
      const afterQuantityText = toFixedString(afterQuantity, QUANTITY_SCALE);
      const after: StockBalance = {
        warehouseId,
        itemId: line.itemId,
        quantity: afterQuantityText,
        unitCost: afterCost,
      };
      movements.push({
        lineNo: line.lineNo,
        warehouseId,
        itemId: line.itemId,
        quantityDelta: toFixedString(difference, QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: afterQuantityText,
        costBefore: before.unitCost,
        costAfter: afterCost,
        unitPrice: toFixedString(costUnitPrice, UNIT_PRICE_SCALE),
        amount: toFixedString(amountOf(movedQuantity, costUnitPrice), AMOUNT_SCALE),
      });
      balances.set(balanceKey(key), after);
      changed.set(balanceKey(key), after);
    }

    for (const balance of changed.values()) {
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
    type: "STOCKTAKE",
    validate: async (document) => validate(document),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedger(document, movements, direction),
  };
}
