import {
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { erpSchema } from "./erp-schema.js";
import { amountType, quantityType, unitPriceType } from "./numeric-types.js";
import { customers, suppliers, warehouses } from "./parties.js";

export const documents = erpSchema.table(
  "documents",
  {
    id: uuid("id").primaryKey(),
    documentNo: text("document_no").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    customerId: uuid("customer_id").references(() => customers.id),
    sourceWarehouseId: uuid("source_warehouse_id").references(() => warehouses.id),
    targetWarehouseId: uuid("target_warehouse_id").references(() => warehouses.id),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("documents_document_no_key").on(table.documentNo),
    index("documents_type_status_idx").on(table.type, table.status),
  ],
);

export const documentLines = erpSchema.table(
  "document_lines",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(),
    quantity: quantityType("quantity").notNull(),
    unitPrice: unitPriceType("unit_price"),
    amount: amountType("amount"),
  },
  (table) => [
    uniqueIndex("document_lines_document_line_no_key").on(table.documentId, table.lineNo),
  ],
);

export const documentNumberCounters = erpSchema.table(
  "document_number_counters",
  {
    type: text("type").notNull(),
    dateKey: text("date_key").notNull(),
    nextValue: integer("next_value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.type, table.dateKey] })],
);
