import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import { DOCUMENT_TYPE_CATALOG, isDocumentType } from "../../shared/document-types";
import type { DocumentType } from "../../shared/document-types";
import type { DocumentLine, DocumentLineInput } from "./model";

export function computeLineAmount(quantityRaw: string, unitPriceRaw: string): string {
  return toFixedString(amountOf(quantity(quantityRaw), unitPrice(unitPriceRaw)), AMOUNT_SCALE);
}

export function buildDocumentLines(
  type: DocumentType,
  inputs: DocumentLineInput[],
  generateId: () => string,
): DocumentLine[] {
  const priced = isDocumentType(type) && DOCUMENT_TYPE_CATALOG[type].priced;
  return inputs.map((line, index) => ({
    id: generateId(),
    lineNo: index + 1,
    itemId: line.itemId.trim(),
    quantity: toFixedString(quantity(line.quantity), QUANTITY_SCALE),
    unitPrice: priced ? toFixedString(unitPrice(line.unitPrice ?? ""), UNIT_PRICE_SCALE) : null,
    amount: priced ? computeLineAmount(line.quantity, line.unitPrice ?? "") : null,
    originalLineId: line.originalLineId ?? null,
  }));
}
