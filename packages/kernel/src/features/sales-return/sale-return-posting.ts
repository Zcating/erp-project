import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amount,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import type { Amount, Quantity } from "@erp-project/shared";
import { DOCUMENT_TYPE_CATALOG } from "../../shared/document-types";
import { ValidationError } from "../../shared/errors";
import type { TransactionContext } from "../../shared/transactions";
import type { Document, DocumentRepository } from "../documents";
import { lockOriginalDocuments, resolveOriginalLine } from "../documents";
import type { StockBalance, StockLedgerRepository } from "../inventory";
import {
  assertPostingPrerequisites,
  balanceKey,
  buildLedgerEntries,
  emptyBalance,
  reverseMovements,
  sumReturned,
  uniqueKeys,
} from "../posting";
import type { InventoryMovement, PostingDirection, PostingTypeHandler } from "../posting";

const ORIGINAL_LINE_WORDING = {
  prefix: "引用的原单据行",
  wrongType: `不是${DOCUMENT_TYPE_CATALOG.SALE_OUTBOUND.label}的行`,
};

type OriginalCostBasis = {
  documentNo: string;
  lineNo: number;
  quantity: Quantity;
  cost: Amount;
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
    const locked = await lockOriginalDocuments(
      documents,
      document.lines.map((line) => line.originalLineId as string),
      context,
    );
    for (const line of document.lines) {
      resolveOriginalLine(
        locked.get(line.originalLineId as string) ?? null,
        line.originalLineId as string,
        "SALE_OUTBOUND",
        ORIGINAL_LINE_WORDING,
      );
    }
  };

  const costBasisOf = async (
    originalLineId: string,
    context: TransactionContext | undefined,
  ): Promise<OriginalCostBasis> => {
    const original = await documents.findByLineId(originalLineId, context);
    const resolved = resolveOriginalLine(
      original,
      originalLineId,
      "SALE_OUTBOUND",
      ORIGINAL_LINE_WORDING,
    );
    const line = resolved.line;
    const entries = await ledger.listEntriesByDocument(resolved.original.id, context);
    const posted = entries.find(
      (entry) => entry.lineNo === line.lineNo && entry.direction === "POST",
    );
    if (posted === undefined) {
      throw new ValidationError(
        `原单据行没有结转成本，无法回冲：${resolved.original.documentNo} 第 ${line.lineNo} 行`,
      );
    }
    return {
      documentNo: resolved.original.documentNo,
      lineNo: line.lineNo,
      quantity: quantity(line.quantity),
      cost: amount(posted.amount),
    };
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
        basis = await costBasisOf(originalLineId, transaction);
        bases.set(originalLineId, basis);
        const prior = await sumReturned(documents, ledger, originalLineId, transaction);
        netQuantities.set(originalLineId, prior.quantity);
        netAllocated.set(originalLineId, prior.amount);
      }
      const previousQuantity = netQuantities.get(originalLineId) as Quantity;
      const previousAllocated = netAllocated.get(originalLineId) as Amount;
      const returned = quantity(line.quantity);
      const cumulative = quantity(toFixedString(previousQuantity.plus(returned), QUANTITY_SCALE));
      if (cumulative.greaterThan(basis.quantity)) {
        const excess = cumulative.minus(basis.quantity);
        throw new ValidationError(
          `${DOCUMENT_TYPE_CATALOG.SALE_RETURN.label} ${document.documentNo} 第 ${line.lineNo} 行超退 ${toFixedString(excess, QUANTITY_SCALE)}：` +
            `累计退货 ${toFixedString(cumulative, QUANTITY_SCALE)} 超过原单据 ${basis.documentNo} 第 ${basis.lineNo} 行已过账数量 ${toFixedString(basis.quantity, QUANTITY_SCALE)}`,
        );
      }
      const target = amount(
        toFixedString(basis.cost.times(cumulative).dividedBy(basis.quantity), AMOUNT_SCALE),
      );
      netQuantities.set(originalLineId, cumulative);
      netAllocated.set(originalLineId, target);
      const allocation = target.minus(previousAllocated);
      const allocationText = toFixedString(allocation, AMOUNT_SCALE);
      const allocationValue = amount(allocationText);
      const unitPriceText = toFixedString(allocationValue.dividedBy(returned), UNIT_PRICE_SCALE);

      const key = { warehouseId, itemId: line.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const afterQuantity = quantity(before.quantity).plus(returned);
      const valueBefore = quantity(before.quantity).times(unitPrice(before.unitCost));
      const valueAfter = valueBefore.plus(allocationValue);
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
        unitPrice: unitPriceText,
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
