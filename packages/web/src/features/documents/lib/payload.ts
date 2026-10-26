import type { DocumentInput, DraftDocumentType } from "./api";
import type { DocumentFormValues } from "./schema";

export function buildDocumentInput(
  values: DocumentFormValues,
  documentType: DraftDocumentType,
): DocumentInput {
  const isReturn = documentType === "SALE_RETURN" || documentType === "PURCHASE_RETURN";
  const priced = documentType !== "STOCKTAKE" && !isReturn;
  const needsSourceWarehouse =
    documentType === "SALE_OUTBOUND" || documentType === "TRANSFER" || isReturn;
  const needsTargetWarehouse = documentType === "PURCHASE_INBOUND" || documentType === "TRANSFER";

  return {
    type: documentType,
    supplierId:
      documentType === "PURCHASE_INBOUND" && values.supplierId !== "" ? values.supplierId : null,
    customerId:
      documentType === "SALE_OUTBOUND" && values.customerId !== "" ? values.customerId : null,
    sourceWarehouseId:
      needsSourceWarehouse && values.sourceWarehouseId !== "" ? values.sourceWarehouseId : null,
    targetWarehouseId:
      needsTargetWarehouse && values.targetWarehouseId !== "" ? values.targetWarehouseId : null,
    warehouseId:
      documentType === "STOCKTAKE" && values.warehouseId !== "" ? values.warehouseId : null,
    lines: values.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: priced && line.unitPrice !== "" ? line.unitPrice : null,
      amount: null,
      unit: line.unit === "" ? null : line.unit,
      originalLineId: line.originalLineId === "" ? null : line.originalLineId,
    })),
  };
}
