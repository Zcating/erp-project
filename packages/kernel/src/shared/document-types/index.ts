export const DOCUMENT_TYPES = [
  "PURCHASE_INBOUND",
  "SALE_OUTBOUND",
  "SALE_RETURN",
  "PURCHASE_RETURN",
  "STOCKTAKE",
  "TRANSFER",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export type DocumentPartyRole = "SUPPLIER" | "CUSTOMER";

export type DocumentWarehouseRole = "SOURCE" | "TARGET" | "COUNT";

export const WAREHOUSE_ROLE_LABELS: Record<DocumentWarehouseRole, string> = {
  SOURCE: "来源仓",
  TARGET: "目标仓",
  COUNT: "仓库",
};

export type DocumentTypeDescription = {
  label: string;
  numberPrefix: string;
  party: DocumentPartyRole | null;
  warehouses: readonly DocumentWarehouseRole[];
  priced: boolean;
  positiveQuantity: boolean;
  uniqueItems: boolean;
  originalType: DocumentType | null;
  originalWarehouseRole: DocumentWarehouseRole | null;
  missingWarehouseMessage: string;
};

export const DOCUMENT_TYPE_CATALOG: Record<DocumentType, DocumentTypeDescription> = {
  PURCHASE_INBOUND: {
    label: "采购入库单",
    numberPrefix: "PIN",
    party: "SUPPLIER",
    warehouses: ["TARGET"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
    missingWarehouseMessage: "采购入库单缺少目标仓库，不能过账",
  },
  SALE_OUTBOUND: {
    label: "销售出库单",
    numberPrefix: "SOUT",
    party: "CUSTOMER",
    warehouses: ["SOURCE"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
    missingWarehouseMessage: "销售出库单缺少来源仓库，不能过账",
  },
  SALE_RETURN: {
    label: "销售退货单",
    numberPrefix: "SRET",
    party: null,
    warehouses: ["SOURCE"],
    priced: false,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: "SALE_OUTBOUND",
    originalWarehouseRole: "SOURCE",
    missingWarehouseMessage: "销售退货单缺少仓库，不能过账",
  },
  PURCHASE_RETURN: {
    label: "采购退货单",
    numberPrefix: "PRET",
    party: null,
    warehouses: ["SOURCE"],
    priced: false,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: "PURCHASE_INBOUND",
    originalWarehouseRole: "TARGET",
    missingWarehouseMessage: "采购退货单缺少仓库，不能过账",
  },
  STOCKTAKE: {
    label: "盘点单",
    numberPrefix: "STK",
    party: null,
    warehouses: ["COUNT"],
    priced: false,
    positiveQuantity: false,
    uniqueItems: true,
    originalType: null,
    originalWarehouseRole: null,
    missingWarehouseMessage: "盘点单缺少仓库，不能过账",
  },
  TRANSFER: {
    label: "调拨单",
    numberPrefix: "TRF",
    party: null,
    warehouses: ["SOURCE", "TARGET"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
    missingWarehouseMessage: "调拨单缺少源仓或目标仓，不能过账",
  },
};

export const RETURN_DOCUMENT_TYPES: readonly DocumentType[] = DOCUMENT_TYPES.filter(
  (type) => DOCUMENT_TYPE_CATALOG[type].originalType !== null,
);
