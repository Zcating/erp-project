CREATE TABLE "erp"."document_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" erp.quantity NOT NULL,
	"unit_price" erp.unit_price,
	"amount" erp.amount
);
--> statement-breakpoint
CREATE TABLE "erp"."document_number_counters" (
	"type" text NOT NULL,
	"date_key" text NOT NULL,
	"next_value" integer NOT NULL,
	CONSTRAINT "document_number_counters_type_date_key_pk" PRIMARY KEY("type","date_key")
);
--> statement-breakpoint
CREATE TABLE "erp"."documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_no" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"supplier_id" uuid,
	"customer_id" uuid,
	"source_warehouse_id" uuid,
	"target_warehouse_id" uuid,
	"warehouse_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp"."document_lines" ADD CONSTRAINT "document_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "erp"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."documents" ADD CONSTRAINT "documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "erp"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."documents" ADD CONSTRAINT "documents_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "erp"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."documents" ADD CONSTRAINT "documents_target_warehouse_id_warehouses_id_fk" FOREIGN KEY ("target_warehouse_id") REFERENCES "erp"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp"."documents" ADD CONSTRAINT "documents_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "erp"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_lines_document_line_no_key" ON "erp"."document_lines" USING btree ("document_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_document_no_key" ON "erp"."documents" USING btree ("document_no");--> statement-breakpoint
CREATE INDEX "documents_type_status_idx" ON "erp"."documents" USING btree ("type","status");