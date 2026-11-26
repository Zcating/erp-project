import { createInMemoryDocumentRepository } from "./in-memory-repository";
import { buildDocumentLines, computeLineAmount } from "./lines";
import {
  DEFAULT_DOCUMENT_TIME_ZONE,
  DOCUMENT_NUMBER_SEQUENCE_WIDTH,
  formatDocumentDate,
  formatDocumentNumber,
} from "./numbering";
import { DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS, isDocumentStatus } from "./model";
import type {
  Document,
  DocumentFilter,
  DocumentInput,
  DocumentLine,
  DocumentLineInput,
  DocumentStatus,
} from "./model";
import { DOCUMENT_TYPES, WAREHOUSE_ROLE_LABELS, isDocumentType } from "../../shared/document-types";
import type {
  DocumentPartyRole,
  DocumentType,
  DocumentWarehouseRole,
} from "../../shared/document-types";
import { lockOriginalDocuments } from "./lock-order";
import type { DocumentItemLookup, DocumentRepository } from "./ports";
import { resolveOriginalLine } from "./returns";
import type { OriginalLineWording, ResolvedOriginalLine } from "./returns";
import { warehouseIdOfRole } from "./warehouse-role";
import { createDocumentService } from "./service";
import type { DocumentService, DocumentServiceOptions } from "./service";
import {
  assertDocumentIsDraft,
  assertDocumentStatusTransition,
  canTransitionDocumentStatus,
  DOCUMENT_STATUS_TRANSITIONS,
  DRAFT_DOCUMENT_STATUS,
  POSTED_DOCUMENT_STATUS,
  VOIDED_DOCUMENT_STATUS,
} from "./state-machine";
import {
  assertDocumentType,
  assertQuantityText,
  validateDocumentInput,
  validateDocumentLine,
} from "./validation";

export const documents = {
  DEFAULT_DOCUMENT_TIME_ZONE,
  DOCUMENT_NUMBER_SEQUENCE_WIDTH,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TRANSITIONS,
  DOCUMENT_TYPES,
  DRAFT_DOCUMENT_STATUS,
  POSTED_DOCUMENT_STATUS,
  VOIDED_DOCUMENT_STATUS,
  WAREHOUSE_ROLE_LABELS,
  assertDocumentIsDraft,
  assertDocumentStatusTransition,
  assertDocumentType,
  assertQuantityText,
  buildDocumentLines,
  canTransitionDocumentStatus,
  computeLineAmount,
  createDocumentService,
  createInMemoryDocumentRepository,
  formatDocumentDate,
  formatDocumentNumber,
  isDocumentStatus,
  isDocumentType,
  lockOriginalDocuments,
  resolveOriginalLine,
  validateDocumentInput,
  validateDocumentLine,
  warehouseIdOfRole,
};

export {
  DEFAULT_DOCUMENT_TIME_ZONE,
  DOCUMENT_NUMBER_SEQUENCE_WIDTH,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TRANSITIONS,
  DOCUMENT_TYPES,
  DRAFT_DOCUMENT_STATUS,
  POSTED_DOCUMENT_STATUS,
  VOIDED_DOCUMENT_STATUS,
  WAREHOUSE_ROLE_LABELS,
  assertDocumentIsDraft,
  assertDocumentStatusTransition,
  assertDocumentType,
  assertQuantityText,
  buildDocumentLines,
  canTransitionDocumentStatus,
  computeLineAmount,
  createDocumentService,
  createInMemoryDocumentRepository,
  formatDocumentDate,
  formatDocumentNumber,
  isDocumentStatus,
  isDocumentType,
  lockOriginalDocuments,
  resolveOriginalLine,
  validateDocumentInput,
  validateDocumentLine,
  warehouseIdOfRole,
};

export type {
  Document,
  DocumentFilter,
  DocumentInput,
  DocumentItemLookup,
  DocumentLine,
  DocumentLineInput,
  DocumentPartyRole,
  DocumentRepository,
  DocumentService,
  DocumentServiceOptions,
  DocumentStatus,
  DocumentType,
  DocumentWarehouseRole,
  OriginalLineWording,
  ResolvedOriginalLine,
};
