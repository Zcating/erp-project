import { DuplicateError } from "../../shared/errors/index.js";
import type { TransactionContext } from "../../shared/transactions/index.js";
import type { ItemMaster } from "./model.js";
import type { ItemMasterRepository } from "./ports.js";

export function createInMemoryItemMasterRepository(): ItemMasterRepository {
  const stored = new Map<string, ItemMaster>();

  const copy = (item: ItemMaster): ItemMaster => ({
    ...item,
    auxiliaryUnits: item.auxiliaryUnits.map((auxiliaryUnit) => ({ ...auxiliaryUnit })),
  });

  const find = (predicate: (item: ItemMaster) => boolean): ItemMaster | null => {
    for (const item of stored.values()) {
      if (predicate(item)) {
        return copy(item);
      }
    }
    return null;
  };

  const assertUnique = (item: ItemMaster): void => {
    for (const existing of stored.values()) {
      if (existing.id === item.id) {
        continue;
      }
      if (existing.code === item.code) {
        throw new DuplicateError(`商品编码重复：${item.code}`);
      }
      if (item.barcode !== null && existing.barcode === item.barcode) {
        throw new DuplicateError(`商品条码重复：${item.barcode}`);
      }
    }
  };

  return {
    async list(_context?: TransactionContext): Promise<ItemMaster[]> {
      return [...stored.values()].map(copy);
    },

    async findById(id: string, _context?: TransactionContext): Promise<ItemMaster | null> {
      const item = stored.get(id);
      return item === undefined ? null : copy(item);
    },

    async findByCode(code: string, _context?: TransactionContext): Promise<ItemMaster | null> {
      return find((item) => item.code === code);
    },

    async findByBarcode(
      barcode: string,
      _context?: TransactionContext,
    ): Promise<ItemMaster | null> {
      return find((item) => item.barcode === barcode);
    },

    async insert(item: ItemMaster, _context?: TransactionContext): Promise<void> {
      assertUnique(item);
      stored.set(item.id, copy(item));
    },

    async update(item: ItemMaster, _context?: TransactionContext): Promise<void> {
      assertUnique(item);
      stored.set(item.id, copy(item));
    },

    async remove(id: string, _context?: TransactionContext): Promise<boolean> {
      return stored.delete(id);
    },
  };
}
