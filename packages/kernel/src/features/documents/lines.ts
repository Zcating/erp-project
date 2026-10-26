import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-inventory-sales/shared";
import {
  isDraftDocumentType,
  type DocumentLine,
  type DocumentLineInput,
  type DocumentType,
} from "./model.js";
import { DOCUMENT_TYPE_RULES } from "./rules.js";

export function computeLineAmount(quantityRaw: string, unitPriceRaw: string): string {
  return toFixedString(amountOf(quantity(quantityRaw), unitPrice(unitPriceRaw)), AMOUNT_SCALE);
}

export function buildDocumentLines(
  type: DocumentType,
  inputs: DocumentLineInput[],
): DocumentLine[] {
  const priced = isDraftDocumentType(type) && DOCUMENT_TYPE_RULES[type].priced;
  return inputs.map((line, index) => ({
    lineNo: index + 1,
    itemId: line.itemId.trim(),
    quantity: toFixedString(quantity(line.quantity), QUANTITY_SCALE),
    unitPrice: priced ? toFixedString(unitPrice(line.unitPrice ?? ""), UNIT_PRICE_SCALE) : null,
    amount: priced ? computeLineAmount(line.quantity, line.unitPrice ?? "") : null,
  }));
}
