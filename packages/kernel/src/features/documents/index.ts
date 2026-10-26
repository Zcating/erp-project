import { createInMemoryDocumentRepository } from "./in-memory-repository";
import { buildDocumentLines, computeLineAmount } from "./lines";
import {
  DEFAULT_DOCUMENT_TIME_ZONE,
  DOCUMENT_NUMBER_SEQUENCE_WIDTH,
  formatDocumentDate,
  formatDocumentNumber,
} from "./numbering";
import {
  DOCUMENT_NUMBER_PREFIXES,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DRAFT_DOCUMENT_TYPES,
  isDocumentStatus,
  isDocumentType,
  isDraftDocumentType,
} from "./model";
import type {
  Document,
  DocumentFilter,
  DocumentInput,
  DocumentLine,
  DocumentLineInput,
  DocumentStatus,
  DocumentType,
  DraftDocumentType,
} from "./model";
import type { DocumentItemLookup, DocumentRepository } from "./ports";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_RULES, WAREHOUSE_ROLE_LABELS } from "./rules";
import type { DocumentPartyRole, DocumentTypeRule, DocumentWarehouseRole } from "./rules";
import { createDocumentService } from "./service";
import type { DocumentService, DocumentServiceOptions } from "./service";
import {
  assertDocumentIsDraft,
  assertDocumentStatusTransition,
  canTransitionDocumentStatus,
  DOCUMENT_STATUS_TRANSITIONS,
} from "./state-machine";
import {
  assertDraftDocumentType,
  assertQuantityText,
  validateDocumentInput,
  validateDocumentLine,
} from "./validation";

export const documents = {
  DEFAULT_DOCUMENT_TIME_ZONE,
  DOCUMENT_NUMBER_PREFIXES,
  DOCUMENT_NUMBER_SEQUENCE_WIDTH,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TRANSITIONS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_RULES,
  DOCUMENT_TYPES,
  DRAFT_DOCUMENT_TYPES,
  WAREHOUSE_ROLE_LABELS,
  assertDocumentIsDraft,
  assertDocumentStatusTransition,
  assertDraftDocumentType,
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
  isDraftDocumentType,
  validateDocumentInput,
  validateDocumentLine,
};

export {
  DEFAULT_DOCUMENT_TIME_ZONE,
  DOCUMENT_NUMBER_PREFIXES,
  DOCUMENT_NUMBER_SEQUENCE_WIDTH,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TRANSITIONS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_RULES,
  DOCUMENT_TYPES,
  DRAFT_DOCUMENT_TYPES,
  WAREHOUSE_ROLE_LABELS,
  assertDocumentIsDraft,
  assertDocumentStatusTransition,
  assertDraftDocumentType,
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
  isDraftDocumentType,
  validateDocumentInput,
  validateDocumentLine,
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
  DocumentTypeRule,
  DocumentWarehouseRole,
  DraftDocumentType,
};
