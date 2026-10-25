CREATE TABLE "erp"."customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact" text
);
--> statement-breakpoint
CREATE TABLE "erp"."suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact" text
);
--> statement-breakpoint
CREATE TABLE "erp"."warehouses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_code_key" ON "erp"."customers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_key" ON "erp"."suppliers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_code_key" ON "erp"."warehouses" USING btree ("code");