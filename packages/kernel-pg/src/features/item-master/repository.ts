import type { ItemMaster, ItemMasterRepository } from "@erp-inventory-sales/kernel";
import { DuplicateError } from "@erp-inventory-sales/kernel";
import { randomUUID } from "node:crypto";
import type { InferSelectModel } from "drizzle-orm";
import { asc, eq, inArray } from "drizzle-orm";
import type { KernelDatabase } from "../../db/client.js";
import { itemAuxiliaryUnits, items } from "../../schema/item-master.js";

type ItemRecord = InferSelectModel<typeof items>;
type AuxiliaryUnitRecord = InferSelectModel<typeof itemAuxiliaryUnits>;

export function createItemMasterRepository(db: KernelDatabase): ItemMasterRepository {
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
    itemIds: string[],
  ): Promise<Map<string, AuxiliaryUnitRecord[]>> => {
    const grouped = new Map<string, AuxiliaryUnitRecord[]>();
    if (itemIds.length === 0) {
      return grouped;
    }
    const rows = await db
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

  const findOneBy = async (row: ItemRecord | undefined): Promise<ItemMaster | null> => {
    if (row === undefined) {
      return null;
    }
    const grouped = await auxiliaryUnitsOf([row.id]);
    return toDomain(row, grouped.get(row.id) ?? []);
  };

  return {
    async list(): Promise<ItemMaster[]> {
      const itemRows = await db.select().from(items).orderBy(asc(items.code));
      const grouped = await auxiliaryUnitsOf(itemRows.map((row) => row.id));
      return itemRows.map((row) => toDomain(row, grouped.get(row.id) ?? []));
    },

    async findById(id: string): Promise<ItemMaster | null> {
      const rows = await db.select().from(items).where(eq(items.id, id)).limit(1);
      return findOneBy(rows[0]);
    },

    async findByCode(code: string): Promise<ItemMaster | null> {
      const rows = await db.select().from(items).where(eq(items.code, code)).limit(1);
      return findOneBy(rows[0]);
    },

    async findByBarcode(barcode: string): Promise<ItemMaster | null> {
      const rows = await db.select().from(items).where(eq(items.barcode, barcode)).limit(1);
      return findOneBy(rows[0]);
    },

    async insert(item: ItemMaster): Promise<void> {
      try {
        await db.insert(items).values({
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
          await db.insert(itemAuxiliaryUnits).values(
            item.auxiliaryUnits.map((auxiliaryUnit) => ({
              id: randomUUID(),
              itemId: item.id,
              unit: auxiliaryUnit.unit,
              conversionRate: auxiliaryUnit.conversionRate,
            })),
          );
        }
      } catch (error) {
        throw translateWriteError(error, item);
      }
    },

    async update(item: ItemMaster): Promise<void> {
      try {
        await db.transaction(async (tx) => {
          await tx
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
          await tx.delete(itemAuxiliaryUnits).where(eq(itemAuxiliaryUnits.itemId, item.id));
          if (item.auxiliaryUnits.length > 0) {
            await tx.insert(itemAuxiliaryUnits).values(
              item.auxiliaryUnits.map((auxiliaryUnit) => ({
                id: randomUUID(),
                itemId: item.id,
                unit: auxiliaryUnit.unit,
                conversionRate: auxiliaryUnit.conversionRate,
              })),
            );
          }
        });
      } catch (error) {
        throw translateWriteError(error, item);
      }
    },

    async remove(id: string): Promise<boolean> {
      const deleted = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id });
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
  return error;
}
