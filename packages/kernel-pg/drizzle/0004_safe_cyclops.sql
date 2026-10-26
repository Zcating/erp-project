CREATE TABLE "erp"."inventory_balances" (
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" erp.quantity NOT NULL,
	"unit_cost" erp.unit_price NOT NULL,
	CONSTRAINT "inventory_balances_warehouse_id_item_id_pk" PRIMARY KEY("warehouse_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "erp"."inventory_ledger_entries" (
	"seq" serial PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"document_no" text NOT NULL,
	"line_no" integer NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"quantity_before" erp.quantity NOT NULL,
	"quantity_after" erp.quantity NOT NULL,
	"cost_before" erp.unit_price NOT NULL,
	"cost_after" erp.unit_price NOT NULL,
	"unit_price" erp.unit_price NOT NULL,
	"amount" erp.amount NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp"."inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "erp"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."inventory_balances" ADD CONSTRAINT "inventory_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "erp"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "erp"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "erp"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "erp"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_ledger_entries_document_idx" ON "erp"."inventory_ledger_entries" USING btree ("document_id","line_no");--> statement-breakpoint
CREATE INDEX "inventory_ledger_entries_document_no_idx" ON "erp"."inventory_ledger_entries" USING btree ("document_no");
