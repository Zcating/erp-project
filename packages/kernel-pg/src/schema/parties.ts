import { text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { erpSchema } from "./erp-schema.js";

export const suppliers = erpSchema.table(
  "suppliers",
  {
    id: uuid("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contact: text("contact"),
  },
  (table) => [uniqueIndex("suppliers_code_key").on(table.code)],
);

export const customers = erpSchema.table(
  "customers",
  {
    id: uuid("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contact: text("contact"),
  },
  (table) => [uniqueIndex("customers_code_key").on(table.code)],
);

export const warehouses = erpSchema.table(
  "warehouses",
  {
    id: uuid("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose"),
  },
  (table) => [uniqueIndex("warehouses_code_key").on(table.code)],
);
