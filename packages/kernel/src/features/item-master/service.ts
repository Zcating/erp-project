import { randomUUID } from "node:crypto";
import { DuplicateError, NotFoundError, ValidationError } from "../../shared/errors/index.js";
import type { ItemMaster, ItemMasterInput } from "./model.js";
import type { ItemMasterRepository } from "./ports.js";
import { formatConversionRate, validateItemMasterInput } from "./validation.js";

export type ItemMasterService = {
  list(): Promise<ItemMaster[]>;
  get(id: string): Promise<ItemMaster>;
  findByBarcode(barcode: string): Promise<ItemMaster>;
  create(input: ItemMasterInput): Promise<ItemMaster>;
  update(id: string, input: ItemMasterInput): Promise<ItemMaster>;
  remove(id: string): Promise<void>;
};

export type ItemMasterServiceOptions = {
  idGenerator?: () => string;
};

export function createItemMasterService(
  repository: ItemMasterRepository,
  options: ItemMasterServiceOptions = {},
): ItemMasterService {
  const generateId = options.idGenerator ?? randomUUID;

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

  const ensureUnique = async (candidate: ItemMaster, ignoredId: string | null): Promise<void> => {
    const sameCode = await repository.findByCode(candidate.code);
    if (sameCode !== null && sameCode.id !== ignoredId) {
      throw new DuplicateError(`商品编码重复：${candidate.code}`);
    }
    if (candidate.barcode !== null) {
      const sameBarcode = await repository.findByBarcode(candidate.barcode);
      if (sameBarcode !== null && sameBarcode.id !== ignoredId) {
        throw new DuplicateError(`商品条码重复：${candidate.barcode}`);
      }
    }
  };

  return {
    async list(): Promise<ItemMaster[]> {
      return repository.list();
    },

    async get(id: string): Promise<ItemMaster> {
      const item = await repository.findById(id);
      if (item === null) {
        throw new NotFoundError(`商品档案不存在：${id}`);
      }
      return item;
    },

    async findByBarcode(barcode: string): Promise<ItemMaster> {
      const normalized = normalizeOptionalText(barcode);
      if (normalized === null) {
        throw new ValidationError("缺少商品条码");
      }
      const item = await repository.findByBarcode(normalized);
      if (item === null) {
        throw new NotFoundError(`查不到条码对应的商品档案：${normalized}`);
      }
      return item;
    },

    async create(input: ItemMasterInput): Promise<ItemMaster> {
      validateItemMasterInput(input);
      const candidate = normalize(input);
      await ensureUnique(candidate, null);
      const item: ItemMaster = { ...candidate, id: generateId() };
      await repository.insert(item);
      return item;
    },

    async update(id: string, input: ItemMasterInput): Promise<ItemMaster> {
      validateItemMasterInput(input);
      const existing = await repository.findById(id);
      if (existing === null) {
        throw new NotFoundError(`商品档案不存在：${id}`);
      }
      const candidate: ItemMaster = { ...normalize(input), id };
      await ensureUnique(candidate, id);
      await repository.update(candidate);
      return candidate;
    },

    async remove(id: string): Promise<void> {
      const existing = await repository.findById(id);
      if (existing === null) {
        throw new NotFoundError(`商品档案不存在：${id}`);
      }
      await repository.remove(id);
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
