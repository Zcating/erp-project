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
  originalLineBasisOf,
  reverseMovements,
  summarizePostedReturns,
  uniqueKeys,
} from "../posting";
import type {
  InventoryMovement,
  OriginalLineBasis,
  PostingDirection,
  PostingTypeHandler,
} from "../posting";

const ORIGINAL_LINE_WORDING = {
  prefix: "引用的原单据行",
  wrongType: `不是${DOCUMENT_TYPE_CATALOG.PURCHASE_INBOUND.label}的行`,
};

export function createPurchaseReturnPostingHandler(
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
      "PURCHASE_INBOUND",
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
    const locked = await ledger.findBalancesForUpdate(keys, transaction);
    const balances = new Map<string, StockBalance>();
    for (const key of keys) {
      const found = locked.find(
        (balance) => balance.warehouseId === key.warehouseId && balance.itemId === key.itemId,
      );
      balances.set(balanceKey(key), found ?? emptyBalance(key));
    }

    const bases = new Map<string, OriginalLineBasis>();
    const cumulatives = new Map<string, Quantity>();
    const movements: InventoryMovement[] = [];

    for (const line of document.lines) {
      const originalLineId = line.originalLineId as string;
      let basis = bases.get(originalLineId);
      if (basis === undefined) {
        basis = await originalLineBasisOf(
          documents,
          originalLineId,
          "PURCHASE_INBOUND",
          ORIGINAL_LINE_WORDING,
          transaction,
        );
        bases.set(originalLineId, basis);
        const prior = await summarizePostedReturns(documents, ledger, originalLineId, transaction);
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
      const before = balances.get(balanceKey(key)) as StockBalance;
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
      balances.set(balanceKey(key), {
        warehouseId,
        itemId: line.itemId,
        quantity: afterQuantityText,
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
    type: "PURCHASE_RETURN",
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
