import { DOCUMENT_TYPE_CATALOG } from "../../shared/document-types";
import { ValidationError } from "../../shared/errors";
import { warehouseIdOfRole } from "../documents";
import type { Document } from "../documents";

export function assertPostingPrerequisites(document: Document): void {
  const description = DOCUMENT_TYPE_CATALOG[document.type];
  if (description.warehouses.some((role) => warehouseIdOfRole(document, role) === null)) {
    throw new ValidationError(description.missingWarehouseMessage);
  }
  if (document.lines.length === 0) {
    throw new ValidationError(`${description.label}没有单据行，不能过账`);
  }
  if (description.originalType === null) {
    return;
  }
  for (const line of document.lines) {
    if (line.originalLineId === null) {
      throw new ValidationError(`第 ${line.lineNo} 行缺少原单据行引用，不能过账`);
    }
  }
}
