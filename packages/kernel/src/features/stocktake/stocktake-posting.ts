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
import { weightedAverageUnitCost } from "../inventory";
import type { StockLedgerRepository } from "../inventory";
import type { InventoryMovement, PostingApplyHandler } from "../posting";

export function createStocktakePostingHandler(_ledger: StockLedgerRepository): PostingApplyHandler {
  return {
    type: "STOCKTAKE",
    policy: { saveMode: "after-loop", ensureZeroBalances: true },
    apply: async (document, context) => {
      const warehouseId = document.warehouseId as string;
      await context.lockBalances(
        document.lines.map((line) => ({ warehouseId, itemId: line.itemId })),
      );

      const movements: InventoryMovement[] = [];
      for (const line of document.lines) {
        const key = { warehouseId, itemId: line.itemId };
        const before = context.balanceOf(key);
        const difference = quantity(line.quantity).minus(quantity(before.quantity));
        if (difference.isZero()) {
          continue;
        }
        const afterQuantity = quantity(before.quantity).plus(difference);
        if (afterQuantity.isNegative()) {
          throw new StockNegativeError(
            `${DOCUMENT_TYPE_CATALOG.STOCKTAKE.label} ${document.documentNo} 第 ${line.lineNo} 行盘亏后账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
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
        await context.saveBalance({
          warehouseId,
          itemId: line.itemId,
          quantity: afterQuantityText,
          unitCost: afterCost,
        });
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
      }
      return movements;
    },
  };
}
