import type { DocumentWarehouseRole } from "../../shared/document-types";
import type { Document } from "./model";

export { WAREHOUSE_ROLE_LABELS } from "../../shared/document-types";
export type { DocumentPartyRole, DocumentWarehouseRole } from "../../shared/document-types";

export function warehouseIdOfRole(
  document: Document,
  role: DocumentWarehouseRole | null,
): string | null {
  if (role === "SOURCE") {
    return document.sourceWarehouseId;
  }
  if (role === "TARGET") {
    return document.targetWarehouseId;
  }
  if (role === "COUNT") {
    return document.warehouseId;
  }
  return null;
}
