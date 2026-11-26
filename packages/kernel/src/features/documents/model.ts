import type { DocumentType } from "../../shared/document-types";

export const DOCUMENT_STATUSES = ["DRAFT", "POSTED", "VOIDED"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "草稿",
  POSTED: "已过账",
  VOIDED: "已作废",
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
  type: DocumentType;
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

export function isDocumentStatus(value: string): value is DocumentStatus {
  return (DOCUMENT_STATUSES as readonly string[]).includes(value);
}
