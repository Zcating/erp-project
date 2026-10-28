import type { DocumentInput, DraftDocumentType } from "@/server";
import { DOCUMENT_FORM_RULES } from "./rules";
import type { DocumentFormValues } from "./schema";

export function buildDocumentInput(
  values: DocumentFormValues,
  documentType: DraftDocumentType,
): DocumentInput {
  const rule = DOCUMENT_FORM_RULES[documentType];
  const party = rule.party;

  return {
    type: documentType,
    supplierId: party === "SUPPLIER" && values.supplierId !== "" ? values.supplierId : null,
    customerId: party === "CUSTOMER" && values.customerId !== "" ? values.customerId : null,
    sourceWarehouseId:
      rule.warehouses.includes("SOURCE") && values.sourceWarehouseId !== ""
        ? values.sourceWarehouseId
        : null,
    targetWarehouseId:
      rule.warehouses.includes("TARGET") && values.targetWarehouseId !== ""
        ? values.targetWarehouseId
        : null,
    warehouseId:
      rule.warehouses.includes("COUNT") && values.warehouseId !== "" ? values.warehouseId : null,
    lines: values.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: rule.priced && line.unitPrice !== "" ? line.unitPrice : null,
      amount: null,
      unit: line.unit === "" ? null : line.unit,
      originalLineId: line.originalLineId === "" ? null : line.originalLineId,
    })),
  };
}
