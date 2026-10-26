export const DOCUMENT_TYPES = [
  "PURCHASE_INBOUND",
  "SALE_OUTBOUND",
  "SALE_RETURN",
  "PURCHASE_RETURN",
  "STOCKTAKE",
  "TRANSFER",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DRAFT_DOCUMENT_TYPES = [
  "PURCHASE_INBOUND",
  "SALE_OUTBOUND",
  "SALE_RETURN",
  "STOCKTAKE",
  "TRANSFER",
] as const;

export type DraftDocumentType = (typeof DRAFT_DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ["DRAFT", "POSTED", "VOIDED"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "草稿",
  POSTED: "已过账",
  VOIDED: "已作废",
};

export const DOCUMENT_NUMBER_PREFIXES: Record<DocumentType, string> = {
  PURCHASE_INBOUND: "PIN",
  SALE_OUTBOUND: "SOUT",
  SALE_RETURN: "SRET",
  PURCHASE_RETURN: "PRET",
  STOCKTAKE: "STK",
  TRANSFER: "TRF",
};

export type DocumentLine = {
  id: string;
  lineNo: number;
  itemId: string;
  quantity: string;
  unitPrice: string | null;
  amount: string | null;
  originalLineId: string | null;
};

export type Document = {
  id: string;
  documentNo: string;
  type: DraftDocumentType;
  status: DocumentStatus;
  supplierId: string | null;
  customerId: string | null;
  sourceWarehouseId: string | null;
  targetWarehouseId: string | null;
  warehouseId: string | null;
  lines: DocumentLine[];
};

export type DocumentLineInput = {
  itemId: string;
  quantity: string;
  unitPrice: string | null;
  amount: string | null;
  unit?: string | null;
  originalLineId?: string | null;
};

export type DocumentInput = {
  type: DocumentType;
  supplierId: string | null;
  customerId: string | null;
  sourceWarehouseId: string | null;
  targetWarehouseId: string | null;
  warehouseId: string | null;
  lines: DocumentLineInput[];
};

export type DocumentFilter = {
  type: DocumentType | null;
  status: DocumentStatus | null;
};

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isDraftDocumentType(value: string): value is DraftDocumentType {
  return (DRAFT_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isDocumentStatus(value: string): value is DocumentStatus {
  return (DOCUMENT_STATUSES as readonly string[]).includes(value);
}
