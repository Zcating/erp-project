import { randomUUID } from "node:crypto";
import {
  ConflictError,
  DuplicateError,
  KernelError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import type { PostedItemReferenceChecker } from "../../shared/ports";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions";
import { itemBatchErrorFromDetails } from "./errors";
import type { ItemBatchErrorDetail } from "./errors";
import type { ItemMaster, ItemMasterInput } from "./model";
import type { ItemMasterRepository } from "./ports";
import { formatConversionRate, validateItemMasterInput } from "./validation";

export type ItemBatchRow = {
  line: number;
  input: ItemMasterInput;
};

export type ItemMasterService = {
  list(context?: TransactionContext): Promise<ItemMaster[]>;
  get(id: string, context?: TransactionContext): Promise<ItemMaster>;
  findByBarcode(barcode: string, context?: TransactionContext): Promise<ItemMaster>;
  create(input: ItemMasterInput, context?: TransactionContext): Promise<ItemMaster>;
  createMany(rows: ItemBatchRow[], context?: TransactionContext): Promise<ItemMaster[]>;
  update(id: string, input: ItemMasterInput, context?: TransactionContext): Promise<ItemMaster>;
  remove(id: string, context?: TransactionContext): Promise<void>;
};

export type ItemMasterServiceOptions = {
  idGenerator?: () => string;
  runner?: TransactionRunner;
  referenceChecker?: PostedItemReferenceChecker;
};

export function createItemMasterService(
  repository: ItemMasterRepository,
  options: ItemMasterServiceOptions = {},
): ItemMasterService {
  const generateId = options.idGenerator ?? randomUUID;
  const runner = options.runner;

  const inTransaction = async <T>(
    context: TransactionContext | undefined,
    work: (context: TransactionContext | undefined) => Promise<T>,
  ): Promise<T> => {
    if (context !== undefined || runner === undefined) {
      return work(context);
    }
    return runner.run((outer) => work(outer));
  };

  const normalize = (input: ItemMasterInput): ItemMaster => ({
    id: "",
    code: input.code.trim(),
    barcode: normalizeOptionalText(input.barcode),
    name: input.name.trim(),
    specification: normalizeOptionalText(input.specification),
    brand: normalizeOptionalText(input.brand),
    category: normalizeOptionalText(input.category),
    baseUnit: input.baseUnit.trim(),
    auxiliaryUnits: input.auxiliaryUnits.map((auxiliaryUnit) => ({
      unit: auxiliaryUnit.unit.trim(),
      conversionRate: formatConversionRate(auxiliaryUnit.conversionRate),
    })),
  });

  const ensureUnique = async (
    candidate: ItemMaster,
    ignoredId: string | null,
    context?: TransactionContext,
  ): Promise<void> => {
    const sameCode = await repository.findByCode(candidate.code, context);
    if (sameCode !== null && sameCode.id !== ignoredId) {
      throw new DuplicateError(`商品编码重复：${candidate.code}`);
    }
    if (candidate.barcode !== null) {
      const sameBarcode = await repository.findByBarcode(candidate.barcode, context);
      if (sameBarcode !== null && sameBarcode.id !== ignoredId) {
        throw new DuplicateError(`商品条码重复：${candidate.barcode}`);
      }
    }
  };

  const ensureNotPostedReferenced = async (id: string): Promise<void> => {
    const checker = options.referenceChecker;
    if (checker === undefined) {
      return;
    }
    const references = await checker.findPostedItemReferences(id);
    if (references.length > 0) {
      throw new ConflictError(
        `商品已被已过账单据 ${references
          .map((reference) => reference.documentNo)
          .join("、")} 引用，不能删除`,
      );
    }
  };

  return {
    async list(context?: TransactionContext): Promise<ItemMaster[]> {
      return repository.list(context);
    },

    async get(id: string, context?: TransactionContext): Promise<ItemMaster> {
      const item = await repository.findById(id, context);
      if (item === null) {
        throw new NotFoundError(`商品档案不存在：${id}`);
      }
      return item;
    },

    async findByBarcode(barcode: string, context?: TransactionContext): Promise<ItemMaster> {
      const normalized = normalizeOptionalText(barcode);
      if (normalized === null) {
        throw new ValidationError("缺少商品条码");
      }
      const item = await repository.findByBarcode(normalized, context);
      if (item === null) {
        throw new NotFoundError(`查不到条码对应的商品档案：${normalized}`);
      }
      return item;
    },

    async create(input: ItemMasterInput, context?: TransactionContext): Promise<ItemMaster> {
      return inTransaction(context, async (ctx) => {
        validateItemMasterInput(input);
        const candidate = normalize(input);
        await ensureUnique(candidate, null, ctx);
        const item: ItemMaster = { ...candidate, id: generateId() };
        await repository.insert(item, ctx);
        return item;
      });
    },

    async createMany(rows: ItemBatchRow[], context?: TransactionContext): Promise<ItemMaster[]> {
      return inTransaction(context, async (ctx) => {
        const details: ItemBatchErrorDetail[] = [];
        const candidates: ItemMaster[] = [];
        const seenCodes = new Set<string>();
        const seenBarcodes = new Set<string>();

        for (const row of rows) {
          try {
            validateItemMasterInput(row.input);
            const candidate = normalize(row.input);
            if (seenCodes.has(candidate.code)) {
              throw new DuplicateError(`商品编码重复：${candidate.code}`);
            }
            if (candidate.barcode !== null && seenBarcodes.has(candidate.barcode)) {
              throw new DuplicateError(`商品条码重复：${candidate.barcode}`);
            }
            await ensureUnique(candidate, null, ctx);
            seenCodes.add(candidate.code);
            if (candidate.barcode !== null) {
              seenBarcodes.add(candidate.barcode);
            }
            candidates.push(candidate);
          } catch (error) {
            if (error instanceof KernelError) {
              details.push({ line: row.line, code: error.code, message: error.message });
              continue;
            }
            throw error;
          }
        }

        if (details.length > 0) {
          throw itemBatchErrorFromDetails(details);
        }

        const items = candidates.map((candidate) => ({ ...candidate, id: generateId() }));
        for (const item of items) {
          await repository.insert(item, ctx);
        }
        return items;
      });
    },

    async update(
      id: string,
      input: ItemMasterInput,
      context?: TransactionContext,
    ): Promise<ItemMaster> {
      return inTransaction(context, async (ctx) => {
        validateItemMasterInput(input);
        const existing = await repository.findById(id, ctx);
        if (existing === null) {
          throw new NotFoundError(`商品档案不存在：${id}`);
        }
        const candidate: ItemMaster = { ...normalize(input), id };
        await ensureUnique(candidate, id, ctx);
        await repository.update(candidate, ctx);
        return candidate;
      });
    },

    async remove(id: string, context?: TransactionContext): Promise<void> {
      const existing = await repository.findById(id, context);
      if (existing === null) {
        throw new NotFoundError(`商品档案不存在：${id}`);
      }
      await ensureNotPostedReferenced(id);
      await repository.remove(id, context);
    },
  };
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
