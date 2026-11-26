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
import type { StockLedgerRepository } from "../inventory";
import type { InventoryMovement, PostingApplyHandler } from "../posting";

export function createSaleOutboundPostingHandler(
  _ledger: StockLedgerRepository,
): PostingApplyHandler {
  return {
    type: "SALE_OUTBOUND",
    policy: { saveMode: "after-loop", ensureZeroBalances: false },
    apply: async (document, context) => {
      const warehouseId = document.sourceWarehouseId as string;
      await context.lockBalances(
        document.lines.map((line) => ({ warehouseId, itemId: line.itemId })),
      );

      const movements: InventoryMovement[] = [];
      for (const line of document.lines) {
        const key = { warehouseId, itemId: line.itemId };
        const before = context.balanceOf(key);
        const outboundQuantity = quantity(line.quantity);
        const afterQuantity = quantity(before.quantity).minus(outboundQuantity);
        if (afterQuantity.isNegative()) {
          throw new StockNegativeError(
            `${DOCUMENT_TYPE_CATALOG.SALE_OUTBOUND.label} ${document.documentNo} 第 ${line.lineNo} 行出库后账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
          );
        }
        const costUnitPrice = unitPrice(before.unitCost);
        await context.saveBalance({
          warehouseId,
          itemId: line.itemId,
          quantity: toFixedString(afterQuantity, QUANTITY_SCALE),
          unitCost: before.unitCost,
        });
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
      }
      return movements;
    },
  };
}
