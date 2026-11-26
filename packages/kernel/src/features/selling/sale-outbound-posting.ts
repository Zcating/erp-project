import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import { DOCUMENT_TYPE_CATALOG } from "../../shared/document-types";
import { StockNegativeError } from "../../shared/errors";
import type { TransactionContext } from "../../shared/transactions";
import type { Document } from "../documents";
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

export function createSaleOutboundPostingHandler(
  ledger: StockLedgerRepository,
): PostingTypeHandler {
  const validate = async (document: Document): Promise<void> => {
    assertPostingPrerequisites(document);
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
          `${DOCUMENT_TYPE_CATALOG.SALE_OUTBOUND.label} ${document.documentNo} 第 ${line.lineNo} 行出库后账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
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
  ): Promise<InventoryMovement[]> => reverseMovements(document, ledger, transaction);

  return {
    type: "SALE_OUTBOUND",
    validate: async (document) => validate(document),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedgerEntries(document, movements, direction),
  };
}
