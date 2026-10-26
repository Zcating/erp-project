import type { DocumentType, DraftDocumentType } from "./model.js";

export type DocumentPartyRole = "SUPPLIER" | "CUSTOMER";

export type DocumentWarehouseRole = "SOURCE" | "TARGET" | "COUNT";

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

export const WAREHOUSE_ROLE_LABELS: Record<DocumentWarehouseRole, string> = {
  SOURCE: "来源仓",
  TARGET: "目标仓",
  COUNT: "仓库",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PURCHASE_INBOUND: "采购入库单",
  SALE_OUTBOUND: "销售出库单",
  SALE_RETURN: "销售退货单",
  PURCHASE_RETURN: "采购退货单",
  STOCKTAKE: "盘点单",
  TRANSFER: "调拨单",
};
