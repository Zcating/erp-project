import type {
  ItemMaster,
  ItemMasterRepository,
  TransactionContext,
} from "@erp-inventory-sales/kernel";
import { ConflictError, DuplicateError } from "@erp-inventory-sales/kernel";
import { randomUUID } from "node:crypto";
import type { InferSelectModel } from "drizzle-orm";
import { asc, eq, inArray } from "drizzle-orm";
import type { KernelDatabase } from "../../db/client";
import type { PgTransaction } from "../../db/transactions";
import { itemAuxiliaryUnits, items } from "../../schema/item-master";

type ItemRecord = InferSelectModel<typeof items>;
type AuxiliaryUnitRecord = InferSelectModel<typeof itemAuxiliaryUnits>;
type ItemMasterExecutor = KernelDatabase | PgTransaction;

export function createItemMasterRepository(db: KernelDatabase): ItemMasterRepository {
  const executorOf = (context?: TransactionContext): ItemMasterExecutor => {
    if (context === undefined) {
      return db;
    }
    const handle = context.handle as PgTransaction | undefined;
    if (handle === undefined || handle === null) {
      throw new Error("事务上下文缺少事务句柄");
    }
    return handle;
  };

  const toDomain = (row: ItemRecord, auxiliaryUnits: AuxiliaryUnitRecord[]): ItemMaster => ({
    id: row.id,
    code: row.code,
    barcode: row.barcode,
    name: row.name,
    specification: row.specification,
    brand: row.brand,
    category: row.category,
    baseUnit: row.baseUnit,
    auxiliaryUnits: auxiliaryUnits.map((auxiliaryUnit) => ({
      unit: auxiliaryUnit.unit,
      conversionRate: auxiliaryUnit.conversionRate,
    })),
  });

  const auxiliaryUnitsOf = async (
    executor: ItemMasterExecutor,
    itemIds: string[],
  ): Promise<Map<string, AuxiliaryUnitRecord[]>> => {
    const grouped = new Map<string, AuxiliaryUnitRecord[]>();
    if (itemIds.length === 0) {
      return grouped;
    }
    const rows = await executor
      .select()
      .from(itemAuxiliaryUnits)
      .where(inArray(itemAuxiliaryUnits.itemId, itemIds));
    for (const row of rows) {
      const current = grouped.get(row.itemId) ?? [];
      current.push(row);
      grouped.set(row.itemId, current);
    }
    return grouped;
  };

  const findOneBy = async (
    executor: ItemMasterExecutor,
    row: ItemRecord | undefined,
  ): Promise<ItemMaster | null> => {
    if (row === undefined) {
      return null;
    }
    const grouped = await auxiliaryUnitsOf(executor, [row.id]);
    return toDomain(row, grouped.get(row.id) ?? []);
  };

  const auxiliaryUnitValues = (item: ItemMaster) =>
    item.auxiliaryUnits.map((auxiliaryUnit) => ({
      id: randomUUID(),
      itemId: item.id,
      unit: auxiliaryUnit.unit,
      conversionRate: auxiliaryUnit.conversionRate,
    }));

  const applyInsert = async (executor: ItemMasterExecutor, item: ItemMaster): Promise<void> => {
    await executor.insert(items).values({
      id: item.id,
      code: item.code,
      barcode: item.barcode,
      name: item.name,
      specification: item.specification,
      brand: item.brand,
      category: item.category,
      baseUnit: item.baseUnit,
    });
    if (item.auxiliaryUnits.length > 0) {
      await executor.insert(itemAuxiliaryUnits).values(auxiliaryUnitValues(item));
    }
  };

  const applyUpdate = async (executor: ItemMasterExecutor, item: ItemMaster): Promise<void> => {
    await executor
      .update(items)
      .set({
        code: item.code,
        barcode: item.barcode,
        name: item.name,
        specification: item.specification,
        brand: item.brand,
        category: item.category,
        baseUnit: item.baseUnit,
      })
      .where(eq(items.id, item.id));
    await executor.delete(itemAuxiliaryUnits).where(eq(itemAuxiliaryUnits.itemId, item.id));
    if (item.auxiliaryUnits.length > 0) {
      await executor.insert(itemAuxiliaryUnits).values(auxiliaryUnitValues(item));
    }
  };

  return {
    async list(context?: TransactionContext): Promise<ItemMaster[]> {
      const executor = executorOf(context);
      const itemRows = await executor.select().from(items).orderBy(asc(items.code));
      const grouped = await auxiliaryUnitsOf(
        executor,
        itemRows.map((row) => row.id),
      );
      return itemRows.map((row) => toDomain(row, grouped.get(row.id) ?? []));
    },

    async findById(id: string, context?: TransactionContext): Promise<ItemMaster | null> {
      const executor = executorOf(context);
      const rows = await executor.select().from(items).where(eq(items.id, id)).limit(1);
      return findOneBy(executor, rows[0]);
    },

    async findByCode(code: string, context?: TransactionContext): Promise<ItemMaster | null> {
      const executor = executorOf(context);
      const rows = await executor.select().from(items).where(eq(items.code, code)).limit(1);
      return findOneBy(executor, rows[0]);
    },

    async findByBarcode(barcode: string, context?: TransactionContext): Promise<ItemMaster | null> {
      const executor = executorOf(context);
      const rows = await executor.select().from(items).where(eq(items.barcode, barcode)).limit(1);
      return findOneBy(executor, rows[0]);
    },

    async insert(item: ItemMaster, context?: TransactionContext): Promise<void> {
      try {
        if (context === undefined) {
          await db.transaction(async (tx) => applyInsert(tx, item));
        } else {
          await applyInsert(executorOf(context), item);
        }
      } catch (error) {
        throw translateWriteError(error, item);
      }
    },

    async update(item: ItemMaster, context?: TransactionContext): Promise<void> {
      const executor = executorOf(context);
      try {
        if (context === undefined) {
          await db.transaction(async (tx) => applyUpdate(tx, item));
        } else {
          await applyUpdate(executor, item);
        }
      } catch (error) {
        throw translateWriteError(error, item);
      }
    },

    async remove(id: string, context?: TransactionContext): Promise<boolean> {
      const executor = executorOf(context);
      const deleted = await executor
        .delete(items)
        .where(eq(items.id, id))
        .returning({ id: items.id });
      return deleted.length > 0;
    },
  };
}

function translateWriteError(error: unknown, item: ItemMaster): unknown {
  const outer = error as { code?: unknown; constraint?: unknown; cause?: unknown } | null;
  if (outer === null || typeof outer !== "object") {
    return error;
  }
  const source =
    outer.cause !== undefined && outer.cause !== null && typeof outer.cause === "object"
      ? (outer.cause as { code?: unknown; constraint?: unknown })
      : outer;
  if (source.code === "23505") {
    if (source.constraint === "items_code_key") {
      return new DuplicateError(`商品编码重复：${item.code}`);
    }
    if (source.constraint === "items_barcode_key") {
      return new DuplicateError(`商品条码重复：${item.barcode ?? ""}`);
    }
    return new DuplicateError(`商品档案重复：${item.code}`);
  }
  if (
    source.code === "23503" &&
    source.constraint === "inventory_ledger_entries_item_id_items_id_fk"
  ) {
    return new ConflictError("商品已被已过账单据引用，不能删除");
  }
  return error;
}
