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

  it("迁移产出的数量、单价、金额类型精度分别是 numeric(18,3)、numeric(18,6)、numeric(18,2)", async () => {
    const domains = await queryDomains();

    expect(domains).toEqual([
      { domain: "erp.amount", baseType: "numeric(18,2)" },
      { domain: "erp.quantity", baseType: "numeric(18,3)" },
      { domain: "erp.unit_price", baseType: "numeric(18,6)" },
    ]);
  });

  it("数量、单价、金额三列写入 0.1 后读回 0.100、0.100000、0.10，没有二进制浮点尾差", async () => {
    const client = await connectToTestDatabase();
    try {
      await client.query(
        "create temporary table precision_probe (quantity erp.quantity, unit_price erp.unit_price, amount erp.amount)",
      );
      await client.query(
        "insert into precision_probe (quantity, unit_price, amount) values ($1, $2, $3)",
        ["0.1", "0.1", "0.1"],
      );

      const rows = await client.query(
        "select quantity::text as quantity, unit_price::text as unit_price, amount::text as amount from precision_probe",
      );

      expect(rows.rows).toEqual([{ quantity: "0.100", unit_price: "0.100000", amount: "0.10" }]);
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
