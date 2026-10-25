CREATE SCHEMA IF NOT EXISTS erp;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'erp' AND t.typname = 'quantity' AND t.typtype = 'd'
  ) THEN
    CREATE DOMAIN erp.quantity AS numeric(18,3);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'erp' AND t.typname = 'unit_price' AND t.typtype = 'd'
  ) THEN
    CREATE DOMAIN erp.unit_price AS numeric(18,6);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'erp' AND t.typname = 'amount' AND t.typtype = 'd'
  ) THEN
    CREATE DOMAIN erp.amount AS numeric(18,2);
  END IF;
END
$$;
