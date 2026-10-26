CREATE TABLE "erp"."transfer_in_transit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"document_no" text NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"source_warehouse_id" uuid NOT NULL,
	"target_warehouse_id" uuid NOT NULL,
	"quantity" erp.quantity NOT NULL,
	"unit_cost" erp.unit_price NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp"."transfer_in_transit" ADD CONSTRAINT "transfer_in_transit_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "erp"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."transfer_in_transit" ADD CONSTRAINT "transfer_in_transit_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "erp"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."transfer_in_transit" ADD CONSTRAINT "transfer_in_transit_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "erp"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."transfer_in_transit" ADD CONSTRAINT "transfer_in_transit_target_warehouse_id_warehouses_id_fk" FOREIGN KEY ("target_warehouse_id") REFERENCES "erp"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_in_transit_document_line_key" ON "erp"."transfer_in_transit" USING btree ("document_id","line_no");--> statement-breakpoint
CREATE INDEX "transfer_in_transit_source_item_idx" ON "erp"."transfer_in_transit" USING btree ("source_warehouse_id","item_id");