CREATE SCHEMA IF NOT EXISTS "erp";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'erp' AND t.typname = 'conversion_rate' AND t.typtype = 'd'
  ) THEN
    CREATE DOMAIN erp.conversion_rate AS numeric(18,6);
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "erp"."item_auxiliary_units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"conversion_rate" erp.conversion_rate NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp"."items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"specification" text,
	"brand" text,
	"category" text,
	"base_unit" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp"."item_auxiliary_units" ADD CONSTRAINT "item_auxiliary_units_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "erp"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_code_key" ON "erp"."items" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "items_barcode_key" ON "erp"."items" USING btree ("barcode") WHERE "erp"."items"."barcode" is not null;
