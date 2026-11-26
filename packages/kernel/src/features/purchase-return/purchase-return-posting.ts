import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import type { Quantity } from "@erp-project/shared";
import { DOCUMENT_TYPE_CATALOG } from "../../shared/document-types";
import { StockNegativeError } from "../../shared/errors";
import type { DocumentRepository } from "../documents";
import type { StockLedgerRepository } from "../inventory";
import {
  RETURN_QUANTITY_ROUNDING,
  assertReturnWithinLimit,
  lockAndValidateOriginalLines,
  originalLineBasisOf,
  summarizePostedReturns,
} from "../posting";
import type { InventoryMovement, OriginalLineBasis, PostingApplyHandler } from "../posting";

const ORIGINAL_LINE_WORDING = {
  prefix: "引用的原单据行",
  wrongType: `不是${DOCUMENT_TYPE_CATALOG.PURCHASE_INBOUND.label}的行`,
};

export function createPurchaseReturnPostingHandler(
  _ledger: StockLedgerRepository,
  _documents: DocumentRepository,
): PostingApplyHandler {
  return {
    type: "PURCHASE_RETURN",
    policy: { saveMode: "after-loop", ensureZeroBalances: false },
    apply: async (document, context) => {
      await lockAndValidateOriginalLines(
        context.documents,
        document.lines.map((line) => line.originalLineId as string),
        "PURCHASE_INBOUND",
        ORIGINAL_LINE_WORDING,
        context.transaction,
      );

      const warehouseId = document.sourceWarehouseId as string;
      await context.lockBalances(
        document.lines.map((line) => ({ warehouseId, itemId: line.itemId })),
      );

      const bases = new Map<string, OriginalLineBasis>();
      const cumulatives = new Map<string, Quantity>();
      const movements: InventoryMovement[] = [];

      for (const line of document.lines) {
        const originalLineId = line.originalLineId as string;
        let basis = bases.get(originalLineId);
        if (basis === undefined) {
          basis = await originalLineBasisOf(
            context.documents,
            originalLineId,
            "PURCHASE_INBOUND",
            ORIGINAL_LINE_WORDING,
            context.transaction,
          );
          bases.set(originalLineId, basis);
          const prior = await summarizePostedReturns(
            context.documents,
            context.ledger,
            originalLineId,
            context.transaction,
          );
          cumulatives.set(originalLineId, prior.quantity);
        }
        const previous = cumulatives.get(originalLineId) as Quantity;
        const returned = quantity(line.quantity);
        const cumulative = assertReturnWithinLimit(
          basis,
          previous,
          returned,
          DOCUMENT_TYPE_CATALOG.PURCHASE_RETURN.label,
          document.documentNo,
          line.lineNo,
          RETURN_QUANTITY_ROUNDING.ON_WRITE,
        );
        cumulatives.set(originalLineId, cumulative);

        const key = { warehouseId, itemId: line.itemId };
        const before = context.balanceOf(key);
        const afterQuantity = quantity(before.quantity).minus(returned);
        if (afterQuantity.isNegative()) {
          throw new StockNegativeError(
            `${DOCUMENT_TYPE_CATALOG.PURCHASE_RETURN.label} ${document.documentNo} 第 ${line.lineNo} 行退货后账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
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
        await context.saveBalance({
          warehouseId,
          itemId: line.itemId,
          quantity: afterQuantityText,
          unitCost: before.unitCost,
        });
      }
      return movements;
    },
  };
}
