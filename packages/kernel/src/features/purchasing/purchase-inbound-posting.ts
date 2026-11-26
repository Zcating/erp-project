import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import type { StockLedgerRepository } from "../inventory";
import { weightedAverageUnitCost } from "../inventory";
import type { InventoryMovement, PostingApplyHandler } from "../posting";

export function createPurchaseInboundPostingHandler(
  _ledger: StockLedgerRepository,
): PostingApplyHandler {
  return {
    type: "PURCHASE_INBOUND",
    policy: { saveMode: "per-line", ensureZeroBalances: true },
    apply: async (document, context) => {
      const warehouseId = document.targetWarehouseId as string;
      await context.lockBalances(
        document.lines.map((line) => ({ warehouseId, itemId: line.itemId })),
      );

      const movements: InventoryMovement[] = [];
      for (const line of document.lines) {
        const key = { warehouseId, itemId: line.itemId };
        const before = context.balanceOf(key);
        const incomingQuantity = quantity(line.quantity);
        const incomingPrice = unitPrice(line.unitPrice ?? "0");
        const afterQuantity = quantity(before.quantity).plus(incomingQuantity);
        const afterCost = weightedAverageUnitCost(
          before.quantity,
          before.unitCost,
          line.quantity,
          line.unitPrice ?? "0",
        );
        await context.saveBalance({
          warehouseId,
          itemId: line.itemId,
          quantity: toFixedString(afterQuantity, QUANTITY_SCALE),
          unitCost: afterCost,
        });
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
      }
      return movements;
    },
  };
}
