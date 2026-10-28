import type { DraftDocumentType } from "@/server";

export type DocumentPartyRole = "SUPPLIER" | "CUSTOMER";

export type DocumentWarehouseRole = "SOURCE" | "TARGET" | "COUNT";

export type DocumentTypeRule = {
  party: DocumentPartyRole | null;
  warehouses: readonly DocumentWarehouseRole[];
  priced: boolean;
  requiresOriginalLine: boolean;
  originalType: DraftDocumentType | null;
  originalWarehouseRole: DocumentWarehouseRole | null;
  shortWarehouseLabels: boolean;
};

export const DOCUMENT_FORM_RULES: Record<DraftDocumentType, DocumentTypeRule> = {
  PURCHASE_INBOUND: {
    party: "SUPPLIER",
    warehouses: ["TARGET"],
    priced: true,
    requiresOriginalLine: false,
    originalType: null,
    originalWarehouseRole: null,
    shortWarehouseLabels: false,
  },
  SALE_OUTBOUND: {
    party: "CUSTOMER",
    warehouses: ["SOURCE"],
    priced: true,
    requiresOriginalLine: false,
    originalType: null,
    originalWarehouseRole: null,
    shortWarehouseLabels: false,
  },
  SALE_RETURN: {
    party: null,
    warehouses: ["SOURCE"],
    priced: false,
    requiresOriginalLine: true,
    originalType: "SALE_OUTBOUND",
    originalWarehouseRole: "SOURCE",
    shortWarehouseLabels: false,
  },
  PURCHASE_RETURN: {
    party: null,
    warehouses: ["SOURCE"],
    priced: false,
    requiresOriginalLine: true,
    originalType: "PURCHASE_INBOUND",
    originalWarehouseRole: "TARGET",
    shortWarehouseLabels: false,
  },
  STOCKTAKE: {
    party: null,
    warehouses: ["COUNT"],
    priced: false,
    requiresOriginalLine: false,
    originalType: null,
    originalWarehouseRole: null,
    shortWarehouseLabels: false,
  },
  TRANSFER: {
    party: null,
    warehouses: ["SOURCE", "TARGET"],
    priced: true,
    requiresOriginalLine: false,
    originalType: null,
    originalWarehouseRole: null,
    shortWarehouseLabels: true,
  },
};

export const PARTY_MISSING_MESSAGES: Record<DocumentPartyRole, string> = {
  SUPPLIER: "缺少供应商",
  CUSTOMER: "缺少客户",
};

export function missingPartyMessage(role: DocumentPartyRole): string {
  return PARTY_MISSING_MESSAGES[role];
}

export function missingWarehouseMessage(
  rule: DocumentTypeRule,
  role: DocumentWarehouseRole,
): string {
  if (role === "SOURCE") {
    return rule.shortWarehouseLabels ? "缺少源仓" : "缺少来源仓库";
  }
  if (role === "TARGET") {
    return rule.shortWarehouseLabels ? "缺少目标仓" : "缺少目标仓库";
  }
  return "缺少仓库";
}

export function requiresDistinctWarehouses(rule: DocumentTypeRule): boolean {
  return rule.warehouses.includes("SOURCE") && rule.warehouses.includes("TARGET");
}

export type DocumentPartyValues = {
  supplierId: string;
  customerId: string;
};

export type DocumentWarehouseValues = {
  sourceWarehouseId: string;
  targetWarehouseId: string;
  warehouseId: string;
};

export function partyFieldOf(role: DocumentPartyRole): "supplierId" | "customerId" {
  return role === "SUPPLIER" ? "supplierId" : "customerId";
}

export function partyValueOf(values: DocumentPartyValues, role: DocumentPartyRole): string {
  return values[partyFieldOf(role)];
}

export function warehouseFieldOf(
  role: DocumentWarehouseRole,
): "sourceWarehouseId" | "targetWarehouseId" | "warehouseId" {
  if (role === "SOURCE") {
    return "sourceWarehouseId";
  }
  if (role === "TARGET") {
    return "targetWarehouseId";
  }
  return "warehouseId";
}

export function warehouseValueOf(
  values: DocumentWarehouseValues,
  role: DocumentWarehouseRole,
): string {
  return values[warehouseFieldOf(role)];
}
