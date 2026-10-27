import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { e2eDatabaseUrl } from "../src/db/config.js";

const CHECK_VIOLATION = "23514";

const uniqueSuffix = (): string => Math.random().toString(36).slice(2, 8);

const errorCodeOf = (error: unknown): string | undefined => {
  const outer = error as { code?: unknown } | null;
  if (outer === null || typeof outer !== "object") {
    return undefined;
  }
  return typeof outer.code === "string" ? outer.code : undefined;
};

type Fixture = {
  client: Client;
  documentId: string;
  itemId: string;
  warehouseId: string;
};

const createFixture = async (): Promise<Fixture> => {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();

  const suffix = uniqueSuffix();
  const warehouseId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const documentId = crypto.randomUUID();

  await client.query(`insert into erp.warehouses (id, code, name) values ($1, $2, $3)`, [
    warehouseId,
    `E2E-STATUS-WH-${suffix}`,
    "状态约束仓库",
  ]);
  await client.query(`insert into erp.items (id, code, name, base_unit) values ($1, $2, $3, $4)`, [
    itemId,
    `E2E-STATUS-ITEM-${suffix}`,
    "状态约束商品",
    "瓶",
  ]);
  await client.query(
    `insert into erp.documents (id, document_no, type, status) values ($1, $2, $3, $4)`,
    [documentId, `E2E-STATUS-DOC-${suffix}`, "PURCHASE_INBOUND", "DRAFT"],
  );

  return { client, documentId, itemId, warehouseId };
};

describe("端到端：状态列的数据库 CHECK 约束（Postgres 适配器）", () => {
  it("单据状态写入非法取值被数据库拒绝，合法取值照常写入", async () => {
    const { client, documentId } = await createFixture();
    try {
      const rejected = await client
        .query(`update erp.documents set status = $1 where id = $2`, ["ARCHIVED", documentId])
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(rejected).toBeDefined();
      expect(errorCodeOf(rejected)).toBe(CHECK_VIOLATION);

      const stored = await client.query(`select status from erp.documents where id = $1`, [
        documentId,
      ]);
      expect(stored.rows.map((row) => row.status)).toEqual(["DRAFT"]);

      await client.query(`update erp.documents set status = $1 where id = $2`, [
        "POSTED",
        documentId,
      ]);
      const posted = await client.query(`select status from erp.documents where id = $1`, [
        documentId,
      ]);
      expect(posted.rows.map((row) => row.status)).toEqual(["POSTED"]);
    } finally {
      await client.end();
    }
  });

  it("在途记录状态写入非法取值被数据库拒绝，合法取值照常写入", async () => {
    const { client, documentId, itemId, warehouseId } = await createFixture();
    try {
      const insert = (status: string): Promise<unknown> =>
        client.query(
          `insert into erp.transfer_in_transit
             (id, document_id, document_no, line_no, item_id, source_warehouse_id, target_warehouse_id, quantity, unit_cost, status)
           values ($1, $2, $3, 1, $4, $5, $5, 3, 1.5, $6)`,
          [crypto.randomUUID(), documentId, "E2E-STATUS-TRF", itemId, warehouseId, status],
        );

      const rejected = await insert("SHIPPED").then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(rejected).toBeDefined();
      expect(errorCodeOf(rejected)).toBe(CHECK_VIOLATION);

      await insert("IN_TRANSIT");
      const stored = await client.query(
        `select status from erp.transfer_in_transit where document_id = $1`,
        [documentId],
      );
      expect(stored.rows.map((row) => row.status)).toEqual(["IN_TRANSIT"]);
    } finally {
      await client.end();
    }
  });

  it("库存流水方向写入非法取值被数据库拒绝，合法取值照常写入", async () => {
    const { client, documentId, itemId, warehouseId } = await createFixture();
    try {
      const insert = (direction: string): Promise<unknown> =>
        client.query(
          `insert into erp.inventory_ledger_entries
             (document_id, document_no, line_no, warehouse_id, item_id, direction,
              quantity_before, quantity_after, cost_before, cost_after, unit_price, amount)
           values ($1, $2, 1, $3, $4, $5, 0, 3, 0, 1.5, 1.5, 4.5)`,
          [documentId, "E2E-STATUS-LEDGER", warehouseId, itemId, direction],
        );

      const rejected = await insert("ADJUST").then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(rejected).toBeDefined();
      expect(errorCodeOf(rejected)).toBe(CHECK_VIOLATION);

      await insert("REVERSAL");
      const stored = await client.query(
        `select direction from erp.inventory_ledger_entries where document_id = $1`,
        [documentId],
      );
      expect(stored.rows.map((row) => row.direction)).toEqual(["REVERSAL"]);
    } finally {
      await client.end();
    }
  });
});
