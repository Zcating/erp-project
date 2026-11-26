import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import type { TransactionContext } from "../../shared/transactions";
import type { Document } from "../documents";
import { weightedAverageUnitCost } from "../inventory";
import type { StockBalance, StockLedgerRepository } from "../inventory";
import {
  assertPostingPrerequisites,
  balanceKey,
  buildLedgerEntries,
  emptyBalance,
  reverseMovements,
  uniqueKeys,
} from "../posting";
import type { InventoryMovement, PostingTypeHandler } from "../posting";

export function createPurchaseInboundPostingHandler(
  ledger: StockLedgerRepository,
): PostingTypeHandler {
  const validate = async (document: Document): Promise<void> => {
    assertPostingPrerequisites(document);
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
      balances.set(balanceKey(key), found ?? emptyBalance(key));
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
  ): Promise<InventoryMovement[]> => reverseMovements(document, ledger, transaction);

  return {
    type: "PURCHASE_INBOUND",
    validate: async (document) => validate(document),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedgerEntries(document, movements, direction),
  };
}
