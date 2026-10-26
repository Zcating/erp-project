import { index, integer, primaryKey, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { erpSchema } from "./erp-schema";
import { items } from "./item-master";
import { amountType, quantityType, unitPriceType } from "./numeric-types";
import { warehouses } from "./parties";

export const inventoryBalances = erpSchema.table(
  "inventory_balances",
  {
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    quantity: quantityType("quantity").notNull(),
    unitCost: unitPriceType("unit_cost").notNull(),
  },
  (table) => [primaryKey({ columns: [table.warehouseId, table.itemId] })],
);

export const inventoryLedgerEntries = erpSchema.table(
  "inventory_ledger_entries",
  {
    seq: serial("seq").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    documentNo: text("document_no").notNull(),
    lineNo: integer("line_no").notNull(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    direction: text("direction").notNull(),
    quantityBefore: quantityType("quantity_before").notNull(),
    quantityAfter: quantityType("quantity_after").notNull(),
    costBefore: unitPriceType("cost_before").notNull(),
    costAfter: unitPriceType("cost_after").notNull(),
    unitPrice: unitPriceType("unit_price").notNull(),
    amount: amountType("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_ledger_entries_document_idx").on(table.documentId, table.lineNo),
    index("inventory_ledger_entries_document_no_idx").on(table.documentNo),
  ],
);
