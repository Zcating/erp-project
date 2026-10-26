import { DuplicateError } from "../../shared/errors";
import type { Customer, Supplier, Warehouse } from "./model";
import type {
  CustomerRepository,
  PartyRepository,
  SupplierRepository,
  WarehouseRepository,
} from "./ports";

export function createInMemorySupplierRepository(): SupplierRepository {
  return createInMemoryPartyRepository<Supplier>("供应商");
}

export function createInMemoryCustomerRepository(): CustomerRepository {
  return createInMemoryPartyRepository<Customer>("客户");
}

export function createInMemoryWarehouseRepository(): WarehouseRepository {
  return createInMemoryPartyRepository<Warehouse>("仓库");
}

function createInMemoryPartyRepository<TRecord extends { id: string; code: string }>(
  label: string,
): PartyRepository<TRecord> {
  const stored = new Map<string, TRecord>();

  const copy = (record: TRecord): TRecord => ({ ...record });

  const assertUniqueCode = (record: TRecord): void => {
    for (const existing of stored.values()) {
      if (existing.id !== record.id && existing.code === record.code) {
        throw new DuplicateError(`${label}编码重复：${record.code}`);
      }
    }
  };

  return {
    async list(): Promise<TRecord[]> {
      return [...stored.values()].map(copy);
    },

    async findById(id: string): Promise<TRecord | null> {
      const record = stored.get(id);
      return record === undefined ? null : copy(record);
    },

    async findByCode(code: string): Promise<TRecord | null> {
      for (const record of stored.values()) {
        if (record.code === code) {
          return copy(record);
        }
      }
      return null;
    },

    async insert(record: TRecord): Promise<void> {
      assertUniqueCode(record);
      stored.set(record.id, copy(record));
    },

    async update(record: TRecord): Promise<void> {
      assertUniqueCode(record);
      stored.set(record.id, copy(record));
    },

    async remove(id: string): Promise<boolean> {
      return stored.delete(id);
    },
  };
}
