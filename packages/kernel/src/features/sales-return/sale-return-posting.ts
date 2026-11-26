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
import type { TransactionContext } from "../../shared/transactions";
import type { Document, DocumentRepository } from "../documents";
import type { StockBalance, StockLedgerRepository } from "../inventory";
import {
  RETURN_QUANTITY_ROUNDING,
  assertPostingPrerequisites,
  assertReturnWithinLimit,
  balanceKey,
  buildLedgerEntries,
  emptyBalance,
  lockAndValidateOriginalLines,
  originalCostBasisOf,
  returnedCostAllocation,
  reverseMovements,
  summarizePostedReturns,
  uniqueKeys,
} from "../posting";
import type {
  InventoryMovement,
  OriginalCostBasis,
  PostingDirection,
  PostingTypeHandler,
} from "../posting";

const ORIGINAL_LINE_WORDING = {
  prefix: "引用的原单据行",
  wrongType: `不是${DOCUMENT_TYPE_CATALOG.SALE_OUTBOUND.label}的行`,
};

export function createSaleReturnPostingHandler(
  ledger: StockLedgerRepository,
  documents: DocumentRepository,
): PostingTypeHandler {
  const validate = async (
    document: Document,
    direction: PostingDirection,
    context?: TransactionContext,
  ): Promise<void> => {
    assertPostingPrerequisites(document);
    if (direction !== "FORWARD") {
      return;
    }
    await lockAndValidateOriginalLines(
      documents,
      document.lines.map((line) => line.originalLineId as string),
      "SALE_OUTBOUND",
      ORIGINAL_LINE_WORDING,
      context,
    );
  };

  const applyForward = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const warehouseId = document.sourceWarehouseId as string;
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

    const bases = new Map<string, OriginalCostBasis>();
    const netQuantities = new Map<string, Quantity>();
    const netAllocated = new Map<string, Amount>();
    const movements: InventoryMovement[] = [];

    for (const line of document.lines) {
      const originalLineId = line.originalLineId as string;
      let basis = bases.get(originalLineId);
      if (basis === undefined) {
        basis = await originalCostBasisOf(
          documents,
          ledger,
          originalLineId,
          "SALE_OUTBOUND",
          ORIGINAL_LINE_WORDING,
          transaction,
        );
        bases.set(originalLineId, basis);
        const prior = await summarizePostedReturns(documents, ledger, originalLineId, transaction);
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
      const before = balances.get(balanceKey(key)) as StockBalance;
      const afterQuantity = quantity(before.quantity).plus(returned);
      const valueBefore = quantity(before.quantity).times(unitPrice(before.unitCost));
      const valueAfter = valueBefore.plus(allocation.allocatedAmount);
      const afterCost = toFixedString(valueAfter.dividedBy(afterQuantity), UNIT_PRICE_SCALE);
      const afterQuantityText = toFixedString(afterQuantity, QUANTITY_SCALE);

      await ledger.saveBalance(
        { warehouseId, itemId: line.itemId, quantity: afterQuantityText, unitCost: afterCost },
        transaction,
      );
      balances.set(balanceKey(key), {
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
  };

  const applyReverse = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => reverseMovements(document, ledger, transaction);

  return {
    type: "SALE_RETURN",
    validate: async (document, direction, transaction) =>
      validate(document, direction, transaction),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedgerEntries(document, movements, direction),
  };
}
