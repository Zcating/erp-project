import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { databaseUrl, e2eDatabaseUrl } from "../src/db/config.js";

const probeTable = "e2e_isolation_probe";

describe("端到端：端到端测试库与开发库隔离", () => {
  it("写入与建结构只发生在端到端测试库，开发库里既没有这些结构也没有这些数据", async () => {
    const testClient = new Client({ connectionString: e2eDatabaseUrl() });
    await testClient.connect();
    try {
      await testClient.query(`drop table if exists ${probeTable}`);
      await testClient.query(
        `create table ${probeTable} (id serial primary key, note text not null)`,
      );
      await testClient.query(`insert into ${probeTable} (note) values ($1)`, ["e2e 写入探针"]);

      const rows = await testClient.query(`select note from ${probeTable}`);
      expect(rows.rows.map((row) => row.note)).toEqual(["e2e 写入探针"]);
    } finally {
      await testClient.end();
    }

    const devClient = new Client({ connectionString: databaseUrl() });
    await devClient.connect();
    try {
      const tables = await devClient.query(
        "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') and table_name = $1",
        [probeTable],
      );
      expect(tables.rows).toEqual([]);
    } finally {
      await devClient.end();
    }
  });
});
