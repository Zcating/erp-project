import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amount,
  quantity,
  toFixedString,
} from "@erp-project/shared";
import type { Amount, Quantity } from "@erp-project/shared";
import type { DocumentType } from "../../shared/document-types";
import { ValidationError } from "../../shared/errors";
import type { TransactionContext } from "../../shared/transactions";
import type { Document, DocumentRepository, OriginalLineWording } from "../documents";
import { lockOriginalDocuments, resolveOriginalLine } from "../documents";
import type { StockLedgerRepository } from "../inventory";

export const RETURN_QUANTITY_ROUNDING = {
  BEFORE_COMPARE: "BEFORE_COMPARE",
  ON_WRITE: "ON_WRITE",
} as const;

export type ReturnQuantityRounding =
  (typeof RETURN_QUANTITY_ROUNDING)[keyof typeof RETURN_QUANTITY_ROUNDING];

export type ReturnedSummary = {
  quantity: Quantity;
  amount: Amount;
};

export type OriginalLineBasis = {
  documentNo: string;
  lineNo: number;
  quantity: Quantity;
};

export type OriginalCostBasis = OriginalLineBasis & {
  cost: Amount;
};

export type ReturnedCostAllocation = {
  cumulativeAmount: Amount;
  allocatedAmount: Amount;
  unitPrice: string;
};

export async function summarizePostedReturns(
  documents: DocumentRepository,
  ledger: StockLedgerRepository,
  originalLineId: string,
  context?: TransactionContext,
): Promise<ReturnedSummary> {
  const returnedQuantity = quantity(
    await documents.sumPostedReturnedQuantity(originalLineId, context),
  );
  const references = await documents.listReturnLineReferences(originalLineId, context);
  let netAmount = amount("0");
  for (const reference of references) {
    const entries = await ledger.listEntriesByDocument(reference.documentId, context);
    for (const entry of entries) {
      if (entry.lineNo !== reference.lineNo) {
        continue;
      }
      netAmount = amount(toFixedString(netAmount.plus(amount(entry.amount)), AMOUNT_SCALE));
    }
  }
  return { quantity: returnedQuantity, amount: netAmount };
}

type ResolvedBasis = {
  basis: OriginalLineBasis;
  original: Document;
};

const resolveBasis = async (
  documents: DocumentRepository,
  originalLineId: string,
  expectedType: DocumentType,
  wording: OriginalLineWording,
  context: TransactionContext | undefined,
): Promise<ResolvedBasis> => {
  const original = await documents.findByLineId(originalLineId, context);
  const resolved = resolveOriginalLine(original, originalLineId, expectedType, wording);
  return {
    basis: {
      documentNo: resolved.original.documentNo,
      lineNo: resolved.line.lineNo,
      quantity: quantity(resolved.line.quantity),
    },
    original: resolved.original,
  };
};

export async function originalLineBasisOf(
  documents: DocumentRepository,
  originalLineId: string,
  expectedType: DocumentType,
  wording: OriginalLineWording,
  context?: TransactionContext,
): Promise<OriginalLineBasis> {
  const { basis } = await resolveBasis(documents, originalLineId, expectedType, wording, context);
  return basis;
}

export async function originalCostBasisOf(
  documents: DocumentRepository,
  ledger: StockLedgerRepository,
  originalLineId: string,
  expectedType: DocumentType,
  wording: OriginalLineWording,
  context?: TransactionContext,
): Promise<OriginalCostBasis> {
  const { basis, original } = await resolveBasis(
    documents,
    originalLineId,
    expectedType,
    wording,
    context,
  );
  const entries = await ledger.listEntriesByDocument(original.id, context);
  const posted = entries.find(
    (entry) => entry.lineNo === basis.lineNo && entry.direction === "POST",
  );
  if (posted === undefined) {
    throw new ValidationError(
      `原单据行没有结转成本，无法回冲：${basis.documentNo} 第 ${basis.lineNo} 行`,
    );
  }
  return { ...basis, cost: amount(posted.amount) };
}

export function remainingReturnableQuantity(
  basis: OriginalLineBasis,
  returned: ReturnedSummary,
): Quantity {
  return quantity(toFixedString(basis.quantity.minus(returned.quantity), QUANTITY_SCALE));
}

export function assertReturnWithinLimit(
  basis: OriginalLineBasis,
  previousQuantity: Quantity,
  returned: Quantity,
  documentTypeLabel: string,
  documentNo: string,
  lineNo: number,
  rounding: ReturnQuantityRounding,
): Quantity {
  const rawCumulative = previousQuantity.plus(returned);
  const roundedCumulative = quantity(toFixedString(rawCumulative, QUANTITY_SCALE));
  const cumulative =
    rounding === RETURN_QUANTITY_ROUNDING.BEFORE_COMPARE ? roundedCumulative : rawCumulative;
  if (cumulative.greaterThan(basis.quantity)) {
    const excess = cumulative.minus(basis.quantity);
    throw new ValidationError(
      `${documentTypeLabel} ${documentNo} 第 ${lineNo} 行超退 ${toFixedString(excess, QUANTITY_SCALE)}：` +
        `累计退货 ${toFixedString(cumulative, QUANTITY_SCALE)} 超过原单据 ${basis.documentNo} 第 ${basis.lineNo} 行已过账数量 ${toFixedString(basis.quantity, QUANTITY_SCALE)}`,
    );
  }
  return roundedCumulative;
}

export function returnedCostAllocation(
  basis: OriginalCostBasis,
  previousAllocated: Amount,
  cumulativeQuantity: Quantity,
  returnedQuantity: Quantity,
): ReturnedCostAllocation {
  const cumulativeAmount = amount(
    toFixedString(basis.cost.times(cumulativeQuantity).dividedBy(basis.quantity), AMOUNT_SCALE),
  );
  const allocatedAmount = amount(
    toFixedString(cumulativeAmount.minus(previousAllocated), AMOUNT_SCALE),
  );
  const unitPrice = toFixedString(allocatedAmount.dividedBy(returnedQuantity), UNIT_PRICE_SCALE);
  return { cumulativeAmount, allocatedAmount, unitPrice };
}

export async function lockAndValidateOriginalLines(
  documents: DocumentRepository,
  originalLineIds: readonly string[],
  expectedType: DocumentType,
  wording: OriginalLineWording,
  context?: TransactionContext,
): Promise<Map<string, Document>> {
  const locked = await lockOriginalDocuments(documents, originalLineIds, context);
  for (const originalLineId of originalLineIds) {
    resolveOriginalLine(locked.get(originalLineId) ?? null, originalLineId, expectedType, wording);
  }
  return locked;
}
