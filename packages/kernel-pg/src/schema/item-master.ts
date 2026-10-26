import { sql } from "drizzle-orm";
import { text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { erpSchema } from "./erp-schema";
import { conversionRateType } from "./numeric-types";

export const items = erpSchema.table(
  "items",
  {
    id: uuid("id").primaryKey(),
    code: text("code").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    specification: text("specification"),
    brand: text("brand"),
    category: text("category"),
    baseUnit: text("base_unit").notNull(),
  },
  (table) => [
    uniqueIndex("items_code_key").on(table.code),
    uniqueIndex("items_barcode_key")
      .on(table.barcode)
      .where(sql`${table.barcode} is not null`),
  ],
);

export const itemAuxiliaryUnits = erpSchema.table("item_auxiliary_units", {
  id: uuid("id").primaryKey(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  unit: text("unit").notNull(),
  conversionRate: conversionRateType("conversion_rate").notNull(),
});
