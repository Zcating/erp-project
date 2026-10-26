import type { DraftDocumentType } from "./model.js";

export type DocumentPartyRole = "SUPPLIER" | "CUSTOMER";

export type DocumentWarehouseRole = "SOURCE" | "TARGET" | "COUNT";

export type DocumentTypeRule = {
  party: DocumentPartyRole | null;
  warehouses: readonly DocumentWarehouseRole[];
  priced: boolean;
};

export const DOCUMENT_TYPE_RULES: Record<DraftDocumentType, DocumentTypeRule> = {
  PURCHASE_INBOUND: {
    party: "SUPPLIER",
    warehouses: ["TARGET"],
    priced: true,
  },
  SALE_OUTBOUND: {
    party: "CUSTOMER",
    warehouses: ["SOURCE"],
    priced: true,
  },
  STOCKTAKE: {
    party: null,
    warehouses: ["COUNT"],
    priced: false,
  },
  TRANSFER: {
    party: null,
    warehouses: ["SOURCE", "TARGET"],
    priced: true,
  },
};
