import type { DocumentWarehouseRole } from "../../shared/document-types";
import type { Document } from "./model";

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
