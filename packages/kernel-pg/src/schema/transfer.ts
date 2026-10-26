import { index, integer, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents.js";
import { erpSchema } from "./erp-schema.js";
import { items } from "./item-master.js";
import { quantityType, unitPriceType } from "./numeric-types.js";
import { warehouses } from "./parties.js";

export const transferInTransit = erpSchema.table(
  "transfer_in_transit",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    documentNo: text("document_no").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    sourceWarehouseId: uuid("source_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    targetWarehouseId: uuid("target_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: quantityType("quantity").notNull(),
    unitCost: unitPriceType("unit_cost").notNull(),
    status: text("status").notNull(),
  },
  (table) => [
    uniqueIndex("transfer_in_transit_document_line_key").on(table.documentId, table.lineNo),
    index("transfer_in_transit_source_item_idx").on(table.sourceWarehouseId, table.itemId),
  ],
);
