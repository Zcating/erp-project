import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "../../shared/errors/index.js";
import type { MasterDataReference, MasterDataReferenceChecker } from "../../shared/ports/index.js";
import type { PostedItemReferenceChecker } from "../../shared/ports/index.js";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions/index.js";
import { baseQuantityOf } from "../item-master/units.js";
import { buildDocumentLines } from "./lines.js";
import type {
  Document,
  DocumentFilter,
  DocumentInput,
  DocumentLineInput,
  DraftDocumentType,
} from "./model.js";
import {
  DEFAULT_DOCUMENT_TIME_ZONE,
  formatDocumentDate,
  formatDocumentNumber,
} from "./numbering.js";
import type { DocumentItemLookup, DocumentRepository } from "./ports.js";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_RULES, WAREHOUSE_ROLE_LABELS } from "./rules.js";
import type { DocumentTypeRule } from "./rules.js";
import { assertDocumentIsDraft } from "./state-machine.js";
import {
  assertDraftDocumentType,
  assertQuantityText,
  validateDocumentInput,
} from "./validation.js";

export type DocumentService = MasterDataReferenceChecker &
  PostedItemReferenceChecker & {
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
  itemLookup?: DocumentItemLookup;
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

  const toBaseUnitLines = async (
    lines: DocumentInput["lines"],
    context: TransactionContext | undefined,
  ): Promise<DocumentInput["lines"]> => {
    const converted: DocumentInput["lines"] = [];
    for (const [index, line] of lines.entries()) {
      const unit = (line.unit ?? "").trim();
      if (unit === "") {
        converted.push(line);
        continue;
      }
      const lookup = options.itemLookup;
      if (lookup === undefined) {
        throw new ValidationError("缺少商品档案查询，无法折算辅助计量单位");
      }
      assertQuantityText(line.quantity, index + 1);
      const item = await lookup.findById(line.itemId.trim(), context);
      if (item === null) {
        throw new NotFoundError(`商品档案不存在：${line.itemId.trim()}`);
      }
      converted.push({ ...line, quantity: baseQuantityOf(item, line.quantity, unit), unit: null });
    }
    return converted;
  };

  const warehouseOfRole = (
    document: Document,
    role: DocumentTypeRule["originalWarehouseRole"],
  ): string | null => {
    if (role === "SOURCE") {
      return document.sourceWarehouseId;
    }
    if (role === "TARGET") {
      return document.targetWarehouseId;
    }
    if (role === "COUNT") {
      return document.warehouseId;
    }
    return null;
  };

  const resolveOriginalLines = async (
    input: DocumentInput & { type: DraftDocumentType },
    context: TransactionContext | undefined,
  ): Promise<DocumentInput & { type: DraftDocumentType }> => {
    const rule = DOCUMENT_TYPE_RULES[input.type];
    if (rule.originalType === null) {
      return input;
    }
    const originalLabel = DOCUMENT_TYPE_LABELS[rule.originalType];
    const warehouseLabel = WAREHOUSE_ROLE_LABELS[rule.originalWarehouseRole ?? "COUNT"];
    const lines: DocumentLineInput[] = [];
    let warehouseId: string | null = null;

    for (const [index, line] of input.lines.entries()) {
      const originalLineId = (line.originalLineId ?? "").trim();
      if (originalLineId === "") {
        throw new ValidationError(`第 ${index + 1} 行缺少原单据行引用`);
      }
      const original = await repository.findByLineId(originalLineId, context);
      if (original === null) {
        throw new ValidationError(`第 ${index + 1} 行引用的原单据行不存在：${originalLineId}`);
      }
      if (original.type !== rule.originalType) {
        throw new ValidationError(
          `第 ${index + 1} 行引用的原单据行不属于${originalLabel}：${original.documentNo}`,
        );
      }
      if (original.status !== "POSTED") {
        throw new ValidationError(
          `第 ${index + 1} 行引用的原单据行尚未过账：${original.documentNo}`,
        );
      }
      const originalLine = original.lines.find((candidate) => candidate.id === originalLineId);
      if (originalLine === undefined) {
        throw new ValidationError(`第 ${index + 1} 行引用的原单据行不存在：${originalLineId}`);
      }
      const originalWarehouseId = warehouseOfRole(original, rule.originalWarehouseRole);
      if (originalWarehouseId === null) {
        throw new ValidationError(
          `原单据 ${original.documentNo} 没有${warehouseLabel}，无法确定退货单仓库`,
        );
      }
      if (warehouseId !== null && warehouseId !== originalWarehouseId) {
        throw new ValidationError(
          `退货单不能引用不同${warehouseLabel}的原单据行：${original.documentNo}`,
        );
      }
      warehouseId = originalWarehouseId;
      lines.push({ ...line, itemId: originalLine.itemId, originalLineId });
    }

    const submitted = [input.sourceWarehouseId, input.targetWarehouseId, input.warehouseId]
      .map((value) => (value ?? "").trim())
      .filter((value) => value !== "");
    if (submitted.some((value) => value !== warehouseId)) {
      throw new ValidationError(
        `退货单的仓库必须取自原单据的${warehouseLabel}：${warehouseId ?? "无"}`,
      );
    }

    return {
      ...input,
      lines,
      sourceWarehouseId: warehouseId,
      targetWarehouseId: null,
      warehouseId: null,
    };
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
    lines: buildDocumentLines(input.type, input.lines, generateId),
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
        const converted: DocumentInput = {
          ...input,
          lines: await toBaseUnitLines(input.lines, ctx),
        };
        assertDraftDocumentType(converted);
        const resolved = await resolveOriginalLines(converted, ctx);
        const validated = validateDocumentInput(resolved);
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
        const converted: DocumentInput = {
          ...input,
          lines: await toBaseUnitLines(input.lines, ctx),
        };
        assertDraftDocumentType(converted);
        const resolved = await resolveOriginalLines(converted, ctx);
        const validated = validateDocumentInput(resolved);
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

    async findPostedItemReferences(itemId: string): Promise<MasterDataReference[]> {
      return repository.findPostedItemReferences(itemId);
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
