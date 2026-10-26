import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "./config.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const resolveFromHere = createRequire(import.meta.url);
const drizzleKitBin = path.join(path.dirname(resolveFromHere.resolve("drizzle-kit")), "bin.cjs");
const TEST_DATABASE_NAME = "erp_test";

describe("数据库迁移", () => {
  beforeAll(async () => {
    await recreateTestDatabase();
  });

  it("在完全空的数据库上从零跑完迁移，命令退出码为 0", () => {
    const result = runMigration();

    expect(result.output).not.toContain("error");
    expect(result.status).toBe(0);
  });

  it("迁移产出的数量、单价、金额、换算率类型精度分别是 numeric(18,3)、numeric(18,6)、numeric(18,2)、numeric(18,6)", async () => {
    const domains = await queryDomains();

    expect(domains).toEqual([
      { domain: "erp.amount", baseType: "numeric(18,2)" },
      { domain: "erp.conversion_rate", baseType: "numeric(18,6)" },
      { domain: "erp.quantity", baseType: "numeric(18,3)" },
      { domain: "erp.unit_price", baseType: "numeric(18,6)" },
    ]);
  });

  it("商品档案与辅助计量单位两张表落在 erp schema，换算率列用 erp.conversion_rate 承载", async () => {
    const client = await connectToTestDatabase();
    try {
      const tables = await client.query(
        `select table_schema, table_name from information_schema.tables
         where table_schema = 'erp' order by table_name`,
      );
      expect(tables.rows).toEqual([
        { table_schema: "erp", table_name: "customers" },
        { table_schema: "erp", table_name: "document_lines" },
        { table_schema: "erp", table_name: "document_number_counters" },
        { table_schema: "erp", table_name: "documents" },
        { table_schema: "erp", table_name: "inventory_balances" },
        { table_schema: "erp", table_name: "inventory_ledger_entries" },
        { table_schema: "erp", table_name: "item_auxiliary_units" },
        { table_schema: "erp", table_name: "items" },
        { table_schema: "erp", table_name: "suppliers" },
        { table_schema: "erp", table_name: "transfer_in_transit" },
        { table_schema: "erp", table_name: "warehouses" },
      ]);

      const columns = await client.query(
        `select a.attname as column_name, format_type(a.atttypid, a.atttypmod) as column_type
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'erp' and c.relname = 'item_auxiliary_units' and a.attnum > 0
         order by a.attname`,
      );
      expect(columns.rows).toEqual([
        { column_name: "conversion_rate", column_type: "erp.conversion_rate" },
        { column_name: "id", column_type: "uuid" },
        { column_name: "item_id", column_type: "uuid" },
        { column_name: "unit", column_type: "text" },
      ]);

      const indexes = await client.query(
        `select indexname, indexdef from pg_indexes
         where schemaname = 'erp' and tablename = 'items' order by indexname`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "items_barcode_key",
        "items_code_key",
        "items_pkey",
      ]);
      expect(indexes.rows.find((row) => row.indexname === "items_barcode_key")?.indexdef).toContain(
        "WHERE",
      );
    } finally {
      await client.end();
    }
  });

  it("供应商、客户与仓库三张表落在 erp schema，各自带编码唯一索引", async () => {
    const client = await connectToTestDatabase();
    try {
      const columns = await client.query(
        `select c.relname as table_name, a.attname as column_name, format_type(a.atttypid, a.atttypmod) as column_type
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'erp' and c.relname in ('suppliers', 'customers', 'warehouses') and a.attnum > 0
         order by c.relname, a.attname`,
      );
      expect(columns.rows).toEqual([
        { table_name: "customers", column_name: "code", column_type: "text" },
        { table_name: "customers", column_name: "contact", column_type: "text" },
        { table_name: "customers", column_name: "id", column_type: "uuid" },
        { table_name: "customers", column_name: "name", column_type: "text" },
        { table_name: "suppliers", column_name: "code", column_type: "text" },
        { table_name: "suppliers", column_name: "contact", column_type: "text" },
        { table_name: "suppliers", column_name: "id", column_type: "uuid" },
        { table_name: "suppliers", column_name: "name", column_type: "text" },
        { table_name: "warehouses", column_name: "code", column_type: "text" },
        { table_name: "warehouses", column_name: "id", column_type: "uuid" },
        { table_name: "warehouses", column_name: "name", column_type: "text" },
        { table_name: "warehouses", column_name: "purpose", column_type: "text" },
      ]);

      const indexes = await client.query(
        `select indexname from pg_indexes
         where schemaname = 'erp' and tablename in ('suppliers', 'customers', 'warehouses')
         order by indexname`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "customers_code_key",
        "customers_pkey",
        "suppliers_code_key",
        "suppliers_pkey",
        "warehouses_code_key",
        "warehouses_pkey",
      ]);
    } finally {
      await client.end();
    }
  });

  it("数量、单价、金额、换算率四列写入 0.1 后读回 0.100、0.100000、0.10、0.100000，没有二进制浮点尾差", async () => {
    const client = await connectToTestDatabase();
    try {
      await client.query(
        "create temporary table precision_probe (quantity erp.quantity, unit_price erp.unit_price, amount erp.amount, conversion_rate erp.conversion_rate)",
      );
      await client.query(
        "insert into precision_probe (quantity, unit_price, amount, conversion_rate) values ($1, $2, $3, $4)",
        ["0.1", "0.1", "0.1", "0.1"],
      );

      const rows = await client.query(
        "select quantity::text as quantity, unit_price::text as unit_price, amount::text as amount, conversion_rate::text as conversion_rate from precision_probe",
      );

      expect(rows.rows).toEqual([
        {
          quantity: "0.100",
          unit_price: "0.100000",
          amount: "0.10",
          conversion_rate: "0.100000",
        },
      ]);
    } finally {
      await client.end();
    }
  });

  it("单据与单据行两张表落在 erp schema，单据行的数量、单价、金额分别用 erp 三个十进制域承载", async () => {
    const client = await connectToTestDatabase();
    try {
      const columns = await client.query(
        `select c.relname as table_name, a.attname as column_name, format_type(a.atttypid, a.atttypmod) as column_type
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'erp' and c.relname in ('documents', 'document_lines', 'document_number_counters') and a.attnum > 0
         order by c.relname, a.attname`,
      );
      expect(columns.rows).toEqual([
        { table_name: "document_lines", column_name: "amount", column_type: "erp.amount" },
        { table_name: "document_lines", column_name: "document_id", column_type: "uuid" },
        { table_name: "document_lines", column_name: "id", column_type: "uuid" },
        { table_name: "document_lines", column_name: "item_id", column_type: "uuid" },
        { table_name: "document_lines", column_name: "line_no", column_type: "integer" },
        {
          table_name: "document_lines",
          column_name: "original_line_id",
          column_type: "uuid",
        },
        { table_name: "document_lines", column_name: "quantity", column_type: "erp.quantity" },
        { table_name: "document_lines", column_name: "unit_price", column_type: "erp.unit_price" },
        {
          table_name: "document_number_counters",
          column_name: "date_key",
          column_type: "text",
        },
        {
          table_name: "document_number_counters",
          column_name: "next_value",
          column_type: "integer",
        },
        { table_name: "document_number_counters", column_name: "type", column_type: "text" },
        {
          table_name: "documents",
          column_name: "created_at",
          column_type: "timestamp with time zone",
        },
        { table_name: "documents", column_name: "customer_id", column_type: "uuid" },
        { table_name: "documents", column_name: "document_no", column_type: "text" },
        { table_name: "documents", column_name: "id", column_type: "uuid" },
        { table_name: "documents", column_name: "source_warehouse_id", column_type: "uuid" },
        { table_name: "documents", column_name: "status", column_type: "text" },
        { table_name: "documents", column_name: "supplier_id", column_type: "uuid" },
        { table_name: "documents", column_name: "target_warehouse_id", column_type: "uuid" },
        { table_name: "documents", column_name: "type", column_type: "text" },
        { table_name: "documents", column_name: "warehouse_id", column_type: "uuid" },
      ]);

      const indexes = await client.query(
        `select indexname from pg_indexes
         where schemaname = 'erp' and tablename in ('documents', 'document_lines', 'document_number_counters')
         order by indexname`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "document_lines_document_line_no_key",
        "document_lines_pkey",
        "document_number_counters_type_date_key_pk",
        "documents_document_no_key",
        "documents_pkey",
        "documents_type_status_idx",
      ]);

      const constraints = await client.query(
        `select conname, pg_get_constraintdef(oid) as definition
         from pg_constraint
         where conrelid = 'erp.document_lines'::regclass
         order by conname`,
      );
      expect(
        constraints.rows.find(
          (row) => row.conname === "document_lines_original_line_id_document_lines_id_fk",
        )?.definition,
      ).toContain("FOREIGN KEY (original_line_id) REFERENCES erp.document_lines(id)");
    } finally {
      await client.end();
    }
  });

  it("重复执行迁移退出码仍为 0，且表清单、列清单与列类型完全一致", async () => {
    const before = await listSchema();

    const result = runMigration();
    expect(result.status).toBe(0);

    const after = await listSchema();
    expect(after).toEqual(before);
  });

  it("库存台账按仓库与商品唯一，库存流水的数量、单价、金额分别用 erp 三个十进制域承载", async () => {
    const client = await connectToTestDatabase();
    try {
      const columns = await client.query(
        `select c.relname as table_name, a.attname as column_name, format_type(a.atttypid, a.atttypmod) as column_type
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'erp' and c.relname in ('inventory_balances', 'inventory_ledger_entries') and a.attnum > 0
         order by c.relname, a.attname`,
      );
      expect(columns.rows).toEqual([
        { table_name: "inventory_balances", column_name: "item_id", column_type: "uuid" },
        {
          table_name: "inventory_balances",
          column_name: "quantity",
          column_type: "erp.quantity",
        },
        {
          table_name: "inventory_balances",
          column_name: "unit_cost",
          column_type: "erp.unit_price",
        },
        {
          table_name: "inventory_balances",
          column_name: "warehouse_id",
          column_type: "uuid",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "amount",
          column_type: "erp.amount",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "cost_after",
          column_type: "erp.unit_price",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "cost_before",
          column_type: "erp.unit_price",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "created_at",
          column_type: "timestamp with time zone",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "direction",
          column_type: "text",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "document_id",
          column_type: "uuid",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "document_no",
          column_type: "text",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "item_id",
          column_type: "uuid",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "line_no",
          column_type: "integer",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "quantity_after",
          column_type: "erp.quantity",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "quantity_before",
          column_type: "erp.quantity",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "seq",
          column_type: "integer",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "unit_price",
          column_type: "erp.unit_price",
        },
        {
          table_name: "inventory_ledger_entries",
          column_name: "warehouse_id",
          column_type: "uuid",
        },
      ]);

      const constraints = await client.query(
        `select conname, pg_get_constraintdef(oid) as definition
         from pg_constraint
         where conrelid in (
           'erp.inventory_balances'::regclass,
           'erp.inventory_ledger_entries'::regclass
         )
         order by conname`,
      );
      const definitions = constraints.rows.map((row) => row.definition as string);
      expect(
        definitions.some((definition) =>
          definition.includes("PRIMARY KEY (warehouse_id, item_id)"),
        ),
      ).toBe(true);
      expect(
        definitions.some((definition) =>
          definition.includes("FOREIGN KEY (item_id) REFERENCES erp.items(id)"),
        ),
      ).toBe(true);

      const indexes = await client.query(
        `select indexname from pg_indexes
         where schemaname = 'erp' and tablename in ('inventory_balances', 'inventory_ledger_entries')
         order by indexname`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "inventory_balances_warehouse_id_item_id_pk",
        "inventory_ledger_entries_document_idx",
        "inventory_ledger_entries_document_no_idx",
        "inventory_ledger_entries_pkey",
      ]);
    } finally {
      await client.end();
    }
  });

  it("在途表落在 erp schema，数量与在途成本分别用 erp.quantity 与 erp.unit_price 承载，并带调拨单据行唯一索引", async () => {
    const client = await connectToTestDatabase();
    try {
      const columns = await client.query(
        `select a.attname as column_name, format_type(a.atttypid, a.atttypmod) as column_type
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'erp' and c.relname = 'transfer_in_transit' and a.attnum > 0
         order by a.attname`,
      );
      expect(columns.rows).toEqual([
        { column_name: "document_id", column_type: "uuid" },
        { column_name: "document_no", column_type: "text" },
        { column_name: "id", column_type: "uuid" },
        { column_name: "item_id", column_type: "uuid" },
        { column_name: "line_no", column_type: "integer" },
        { column_name: "quantity", column_type: "erp.quantity" },
        { column_name: "source_warehouse_id", column_type: "uuid" },
        { column_name: "status", column_type: "text" },
        { column_name: "target_warehouse_id", column_type: "uuid" },
        { column_name: "unit_cost", column_type: "erp.unit_price" },
      ]);

      const indexes = await client.query(
        `select indexname from pg_indexes
         where schemaname = 'erp' and tablename = 'transfer_in_transit'
         order by indexname`,
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "transfer_in_transit_document_line_key",
        "transfer_in_transit_pkey",
        "transfer_in_transit_source_item_idx",
      ]);

      const constraints = await client.query(
        `select conname, pg_get_constraintdef(oid) as definition
         from pg_constraint
         where conrelid = 'erp.transfer_in_transit'::regclass
         order by conname`,
      );
      const definitions = constraints.rows.map((row) => row.definition as string);
      expect(
        definitions.some((definition) =>
          definition.includes("FOREIGN KEY (document_id) REFERENCES erp.documents(id)"),
        ),
      ).toBe(true);
      expect(
        definitions.some((definition) =>
          definition.includes("FOREIGN KEY (source_warehouse_id) REFERENCES erp.warehouses(id)"),
        ),
      ).toBe(true);
    } finally {
      await client.end();
    }
  });
});

function runMigration(): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [drizzleKitBin, "migrate"], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    encoding: "utf8",
  });

  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

async function connectToTestDatabase(): Promise<Client> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  return client;
}

async function connectToMaintenanceDatabase(): Promise<Client> {
  const url = new URL(testDatabaseUrl());
  url.pathname = "/postgres";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  return client;
}

async function recreateTestDatabase(): Promise<void> {
  const client = await connectToMaintenanceDatabase();
  try {
    await client.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [TEST_DATABASE_NAME],
    );
    await client.query(`drop database if exists ${TEST_DATABASE_NAME}`);
    await client.query(`create database ${TEST_DATABASE_NAME}`);
  } finally {
    await client.end();
  }
}

async function queryDomains(): Promise<{ domain: string; baseType: string }[]> {
  const client = await connectToTestDatabase();
  try {
    const result = await client.query(
      `select n.nspname || '.' || t.typname as domain, format_type(t.typbasetype, t.typtypmod) as base_type
       from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where t.typtype = 'd' and n.nspname not in ('pg_catalog', 'information_schema')
       order by domain`,
    );
    return result.rows.map((row) => ({ domain: row.domain, baseType: row.base_type }));
  } finally {
    await client.end();
  }
}

async function listSchema(): Promise<unknown> {
  const client = await connectToTestDatabase();
  try {
    const tables = await client.query(
      `select table_schema, table_name from information_schema.tables
       where table_schema not in ('pg_catalog', 'information_schema')
       order by table_schema, table_name`,
    );
    const columns = await client.query(
      `select table_schema, table_name, column_name, data_type, udt_name
       from information_schema.columns
       where table_schema not in ('pg_catalog', 'information_schema')
       order by table_schema, table_name, column_name`,
    );
    const domains = await client.query(
      `select n.nspname || '.' || t.typname as domain, format_type(t.typbasetype, t.typtypmod) as base_type
       from pg_type t join pg_namespace n on n.oid = t.typnamespace
       where t.typtype = 'd' and n.nspname not in ('pg_catalog', 'information_schema')
       order by domain`,
    );
    return { tables: tables.rows, columns: columns.rows, domains: domains.rows };
  } finally {
    await client.end();
  }
}
