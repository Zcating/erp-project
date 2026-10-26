import { randomUUID } from "node:crypto";
import { NotFoundError } from "../../shared/errors/index.js";
import type { MasterDataReference, MasterDataReferenceChecker } from "../../shared/ports/index.js";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions/index.js";
import { buildDocumentLines } from "./lines.js";
import type { Document, DocumentFilter, DocumentInput, DraftDocumentType } from "./model.js";
import {
  DEFAULT_DOCUMENT_TIME_ZONE,
  formatDocumentDate,
  formatDocumentNumber,
} from "./numbering.js";
import type { DocumentRepository } from "./ports.js";
import { assertDocumentIsDraft } from "./state-machine.js";
import { validateDocumentInput } from "./validation.js";

export type DocumentService = MasterDataReferenceChecker & {
  list(filter?: DocumentFilter): Promise<Document[]>;
  get(id: string): Promise<Document>;
  create(input: DocumentInput, context?: TransactionContext): Promise<Document>;
  update(id: string, input: DocumentInput, context?: TransactionContext): Promise<Document>;
  remove(id: string, context?: TransactionContext): Promise<void>;
};

export type DocumentServiceOptions = {
  idGenerator?: () => string;
  runner?: TransactionRunner;
  clock?: () => Date;
  timeZone?: string;
};

export function createDocumentService(
  repository: DocumentRepository,
  options: DocumentServiceOptions = {},
): DocumentService {
  const generateId = options.idGenerator ?? randomUUID;
  const runner = options.runner;
  const clock = options.clock ?? (() => new Date());
  const timeZone = options.timeZone ?? DEFAULT_DOCUMENT_TIME_ZONE;

  const inTransaction = async <T>(
    context: TransactionContext | undefined,
    work: (context: TransactionContext | undefined) => Promise<T>,
  ): Promise<T> => {
    if (context !== undefined || runner === undefined) {
      return work(context);
    }
    return runner.run((outer) => work(outer));
  };

  const normalize = (
    input: DocumentInput & { type: DraftDocumentType },
    id: string,
    documentNo: string,
  ): Document => ({
    id,
    documentNo,
    type: input.type,
    status: "DRAFT",
    supplierId: normalizeId(input.supplierId),
    customerId: normalizeId(input.customerId),
    sourceWarehouseId: normalizeId(input.sourceWarehouseId),
    targetWarehouseId: normalizeId(input.targetWarehouseId),
    warehouseId: normalizeId(input.warehouseId),
    lines: buildDocumentLines(input.type, input.lines),
  });

  return {
    async list(filter?: DocumentFilter): Promise<Document[]> {
      return repository.list(filter ?? { type: null, status: null });
    },

    async get(id: string): Promise<Document> {
      const document = await repository.findById(id);
      if (document === null) {
        throw new NotFoundError(`单据不存在：${id}`);
      }
      return document;
    },

    async create(input: DocumentInput, context?: TransactionContext): Promise<Document> {
      return inTransaction(context, async (ctx) => {
        const validated = validateDocumentInput(input);
        const dateKey = formatDocumentDate(clock(), timeZone);
        const sequence = await repository.nextSequence(validated.type, dateKey, ctx);
        const documentNo = formatDocumentNumber(validated.type, dateKey, sequence);
        const document = normalize(validated, generateId(), documentNo);
        await repository.insert(document, ctx);
        return document;
      });
    },

    async update(
      id: string,
      input: DocumentInput,
      context?: TransactionContext,
    ): Promise<Document> {
      return inTransaction(context, async (ctx) => {
        const existing = await repository.findById(id, ctx);
        if (existing === null) {
          throw new NotFoundError(`单据不存在：${id}`);
        }
        assertDocumentIsDraft(existing.status, existing.documentNo);
        const validated = validateDocumentInput(input);
        const updated: Document = {
          ...normalize(validated, existing.id, existing.documentNo),
          status: existing.status,
        };
        await repository.update(updated, ctx);
        return updated;
      });
    },

    async remove(id: string, context?: TransactionContext): Promise<void> {
      const existing = await repository.findById(id, context);
      if (existing === null) {
        throw new NotFoundError(`单据不存在：${id}`);
      }
      assertDocumentIsDraft(existing.status, existing.documentNo);
      await repository.remove(id, context);
    },

    async findMasterDataReferences(masterDataId: string): Promise<MasterDataReference[]> {
      return repository.findMasterDataReferences(masterDataId);
    },
  };
}

function normalizeId(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
