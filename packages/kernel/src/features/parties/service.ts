import { randomUUID } from "node:crypto";
import { DuplicateError, NotFoundError } from "../../shared/errors/index.js";
import type {
  Customer,
  CustomerInput,
  Supplier,
  SupplierInput,
  Warehouse,
  WarehouseInput,
} from "./model.js";
import type {
  CustomerRepository,
  PartyRepository,
  SupplierRepository,
  WarehouseRepository,
} from "./ports.js";
import {
  validateCustomerInput,
  validateSupplierInput,
  validateWarehouseInput,
} from "./validation.js";

export type SupplierService = {
  list(): Promise<Supplier[]>;
  get(id: string): Promise<Supplier>;
  create(input: SupplierInput): Promise<Supplier>;
  update(id: string, input: SupplierInput): Promise<Supplier>;
  remove(id: string): Promise<void>;
};

export type CustomerService = {
  list(): Promise<Customer[]>;
  get(id: string): Promise<Customer>;
  create(input: CustomerInput): Promise<Customer>;
  update(id: string, input: CustomerInput): Promise<Customer>;
  remove(id: string): Promise<void>;
};

export type WarehouseService = {
  list(): Promise<Warehouse[]>;
  get(id: string): Promise<Warehouse>;
  create(input: WarehouseInput): Promise<Warehouse>;
  update(id: string, input: WarehouseInput): Promise<Warehouse>;
  remove(id: string): Promise<void>;
};

export type PartyServiceOptions = {
  idGenerator?: () => string;
};

export function createSupplierService(
  repository: SupplierRepository,
  options: PartyServiceOptions = {},
): SupplierService {
  return createPartyService<Supplier, SupplierInput>(
    {
      label: "供应商",
      repository,
      validate: validateSupplierInput,
      normalize: (input, id) => ({
        id,
        code: input.code.trim(),
        name: input.name.trim(),
        contact: normalizeOptionalText(input.contact),
      }),
    },
    options,
  );
}

export function createCustomerService(
  repository: CustomerRepository,
  options: PartyServiceOptions = {},
): CustomerService {
  return createPartyService<Customer, CustomerInput>(
    {
      label: "客户",
      repository,
      validate: validateCustomerInput,
      normalize: (input, id) => ({
        id,
        code: input.code.trim(),
        name: input.name.trim(),
        contact: normalizeOptionalText(input.contact),
      }),
    },
    options,
  );
}

export function createWarehouseService(
  repository: WarehouseRepository,
  options: PartyServiceOptions = {},
): WarehouseService {
  return createPartyService<Warehouse, WarehouseInput>(
    {
      label: "仓库",
      repository,
      validate: validateWarehouseInput,
      normalize: (input, id) => ({
        id,
        code: input.code.trim(),
        name: input.name.trim(),
        purpose: normalizeOptionalText(input.purpose),
      }),
    },
    options,
  );
}

type PartyServiceConfig<TRecord extends { id: string; code: string }, TInput> = {
  label: string;
  repository: PartyRepository<TRecord>;
  validate: (input: TInput) => void;
  normalize: (input: TInput, id: string) => TRecord;
};

function createPartyService<TRecord extends { id: string; code: string }, TInput>(
  config: PartyServiceConfig<TRecord, TInput>,
  options: PartyServiceOptions,
): {
  list(): Promise<TRecord[]>;
  get(id: string): Promise<TRecord>;
  create(input: TInput): Promise<TRecord>;
  update(id: string, input: TInput): Promise<TRecord>;
  remove(id: string): Promise<void>;
} {
  const generateId = options.idGenerator ?? randomUUID;

  const ensureUniqueCode = async (code: string, ignoredId: string | null): Promise<void> => {
    const same = await config.repository.findByCode(code);
    if (same !== null && same.id !== ignoredId) {
      throw new DuplicateError(`${config.label}编码重复：${code}`);
    }
  };

  return {
    async list(): Promise<TRecord[]> {
      return config.repository.list();
    },

    async get(id: string): Promise<TRecord> {
      const record = await config.repository.findById(id);
      if (record === null) {
        throw new NotFoundError(`${config.label}不存在：${id}`);
      }
      return record;
    },

    async create(input: TInput): Promise<TRecord> {
      config.validate(input);
      const record = config.normalize(input, generateId());
      await ensureUniqueCode(record.code, null);
      await config.repository.insert(record);
      return record;
    },

    async update(id: string, input: TInput): Promise<TRecord> {
      config.validate(input);
      const existing = await config.repository.findById(id);
      if (existing === null) {
        throw new NotFoundError(`${config.label}不存在：${id}`);
      }
      const record = config.normalize(input, id);
      await ensureUniqueCode(record.code, id);
      await config.repository.update(record);
      return record;
    },

    async remove(id: string): Promise<void> {
      const existing = await config.repository.findById(id);
      if (existing === null) {
        throw new NotFoundError(`${config.label}不存在：${id}`);
      }
      await config.repository.remove(id);
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
