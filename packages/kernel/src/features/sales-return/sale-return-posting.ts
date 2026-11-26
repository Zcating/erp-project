import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import type { Amount, Quantity } from "@erp-project/shared";
import { DOCUMENT_TYPE_CATALOG } from "../../shared/document-types";
import type { DocumentRepository } from "../documents";
import type { StockLedgerRepository } from "../inventory";
import {
  RETURN_QUANTITY_ROUNDING,
  assertReturnWithinLimit,
  lockAndValidateOriginalLines,
  originalCostBasisOf,
  returnedCostAllocation,
  summarizePostedReturns,
} from "../posting";
import type { InventoryMovement, OriginalCostBasis, PostingApplyHandler } from "../posting";

const ORIGINAL_LINE_WORDING = {
  prefix: "引用的原单据行",
  wrongType: `不是${DOCUMENT_TYPE_CATALOG.SALE_OUTBOUND.label}的行`,
};

export function createSaleReturnPostingHandler(
  _ledger: StockLedgerRepository,
  _documents: DocumentRepository,
): PostingApplyHandler {
  return {
    type: "SALE_RETURN",
    policy: { saveMode: "per-line", ensureZeroBalances: true },
    apply: async (document, context) => {
      await lockAndValidateOriginalLines(
        context.documents,
        document.lines.map((line) => line.originalLineId as string),
        "SALE_OUTBOUND",
        ORIGINAL_LINE_WORDING,
        context.transaction,
      );

      const warehouseId = document.sourceWarehouseId as string;
      await context.lockBalances(
        document.lines.map((line) => ({ warehouseId, itemId: line.itemId })),
      );

      const bases = new Map<string, OriginalCostBasis>();
      const netQuantities = new Map<string, Quantity>();
      const netAllocated = new Map<string, Amount>();
      const movements: InventoryMovement[] = [];

      for (const line of document.lines) {
        const originalLineId = line.originalLineId as string;
        let basis = bases.get(originalLineId);
        if (basis === undefined) {
          basis = await originalCostBasisOf(
            context.documents,
            context.ledger,
            originalLineId,
            "SALE_OUTBOUND",
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
          netQuantities.set(originalLineId, prior.quantity);
          netAllocated.set(originalLineId, prior.amount);
        }
        const previousQuantity = netQuantities.get(originalLineId) as Quantity;
        const previousAllocated = netAllocated.get(originalLineId) as Amount;
        const returned = quantity(line.quantity);
        const cumulative = assertReturnWithinLimit(
          basis,
          previousQuantity,
          returned,
          DOCUMENT_TYPE_CATALOG.SALE_RETURN.label,
          document.documentNo,
          line.lineNo,
          RETURN_QUANTITY_ROUNDING.BEFORE_COMPARE,
        );
        const allocation = returnedCostAllocation(basis, previousAllocated, cumulative, returned);
        netQuantities.set(originalLineId, cumulative);
        netAllocated.set(originalLineId, allocation.cumulativeAmount);
        const allocationText = toFixedString(allocation.allocatedAmount, AMOUNT_SCALE);

        const key = { warehouseId, itemId: line.itemId };
        const before = context.balanceOf(key);
        const afterQuantity = quantity(before.quantity).plus(returned);
        const valueBefore = quantity(before.quantity).times(unitPrice(before.unitCost));
        const valueAfter = valueBefore.plus(allocation.allocatedAmount);
        const afterCost = toFixedString(valueAfter.dividedBy(afterQuantity), UNIT_PRICE_SCALE);
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
          quantityDelta: toFixedString(returned, QUANTITY_SCALE),
          quantityBefore: before.quantity,
          quantityAfter: afterQuantityText,
          costBefore: before.unitCost,
          costAfter: afterCost,
          unitPrice: allocation.unitPrice,
          amount: allocationText,
        });
      }
      return movements;
    },
  };
}
