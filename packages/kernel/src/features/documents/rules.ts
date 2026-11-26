import {
  WAREHOUSE_ROLE_LABELS,
  type DocumentPartyRole,
  type DocumentWarehouseRole,
} from "../../shared/document-types";
import type { Document, DocumentType, DraftDocumentType } from "./model";

export { WAREHOUSE_ROLE_LABELS };
export type { DocumentPartyRole, DocumentWarehouseRole };

export type DocumentTypeRule = {
  party: DocumentPartyRole | null;
  warehouses: readonly DocumentWarehouseRole[];
  priced: boolean;
  positiveQuantity: boolean;
  uniqueItems: boolean;
  originalType: DocumentType | null;
  originalWarehouseRole: DocumentWarehouseRole | null;
};

export const DOCUMENT_TYPE_RULES: Record<DraftDocumentType, DocumentTypeRule> = {
  PURCHASE_INBOUND: {
    party: "SUPPLIER",
    warehouses: ["TARGET"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
  },
  SALE_OUTBOUND: {
    party: "CUSTOMER",
    warehouses: ["SOURCE"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
  },
  SALE_RETURN: {
    party: null,
    warehouses: ["SOURCE"],
    priced: false,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: "SALE_OUTBOUND",
    originalWarehouseRole: "SOURCE",
  },
  PURCHASE_RETURN: {
    party: null,
    warehouses: ["SOURCE"],
    priced: false,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: "PURCHASE_INBOUND",
    originalWarehouseRole: "TARGET",
  },
  STOCKTAKE: {
    party: null,
    warehouses: ["COUNT"],
    priced: false,
    positiveQuantity: false,
    uniqueItems: true,
    originalType: null,
    originalWarehouseRole: null,
  },
  TRANSFER: {
    party: null,
    warehouses: ["SOURCE", "TARGET"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
  },
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PURCHASE_INBOUND: "采购入库单",
  SALE_OUTBOUND: "销售出库单",
  SALE_RETURN: "销售退货单",
  PURCHASE_RETURN: "采购退货单",
  STOCKTAKE: "盘点单",
  TRANSFER: "调拨单",
};

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
