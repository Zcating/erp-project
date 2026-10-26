import { createInMemoryDocumentRepository } from "./in-memory-repository.js";
import { buildDocumentLines, computeLineAmount } from "./lines.js";
import {
  DEFAULT_DOCUMENT_TIME_ZONE,
  DOCUMENT_NUMBER_SEQUENCE_WIDTH,
  formatDocumentDate,
  formatDocumentNumber,
} from "./numbering.js";
import {
  DOCUMENT_NUMBER_PREFIXES,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DRAFT_DOCUMENT_TYPES,
  isDocumentStatus,
  isDocumentType,
  isDraftDocumentType,
} from "./model.js";
import type {
  Document,
  DocumentFilter,
  DocumentInput,
  DocumentLine,
  DocumentLineInput,
  DocumentStatus,
  DocumentType,
  DraftDocumentType,
} from "./model.js";
import type { DocumentItemLookup, DocumentRepository } from "./ports.js";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_RULES, WAREHOUSE_ROLE_LABELS } from "./rules.js";
import type { DocumentPartyRole, DocumentTypeRule, DocumentWarehouseRole } from "./rules.js";
import { createDocumentService } from "./service.js";
import type { DocumentService, DocumentServiceOptions } from "./service.js";
import {
  assertDocumentIsDraft,
  assertDocumentStatusTransition,
  canTransitionDocumentStatus,
  DOCUMENT_STATUS_TRANSITIONS,
} from "./state-machine.js";
import {
  assertDraftDocumentType,
  assertQuantityText,
  validateDocumentInput,
  validateDocumentLine,
} from "./validation.js";

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
