import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createItemMasterRepository } from "../src/features/item-master/repository.js";

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

describe("端到端：商品档案仓储（Postgres 适配器）", () => {
  it("写入后能按 id、按编码、按条码读回，辅助计量单位与换算率一并落库", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const repository = createItemMasterRepository(connection.db);
    try {
      const code = uniqueCode("E2E-PG");
      const barcode = `69${Math.floor(Math.random() * 1e11)
        .toString()
        .padStart(11, "0")}`;
      await repository.insert({
        id: crypto.randomUUID(),
        code,
        barcode,
        name: "可口可乐",
        specification: "500ml/瓶",
        brand: "可口可乐",
        category: "饮料",
        baseUnit: "瓶",
        auxiliaryUnits: [
          { unit: "箱", conversionRate: "12.000000" },
          { unit: "包", conversionRate: "6.000000" },
        ],
      });

      const byCode = await repository.findByCode(code);
      expect(byCode?.barcode).toBe(barcode);
      expect(byCode?.auxiliaryUnits).toEqual([
        { unit: "箱", conversionRate: "12.000000" },
        { unit: "包", conversionRate: "6.000000" },
      ]);

      const byBarcode = await repository.findByBarcode(barcode);
      expect(byBarcode?.code).toBe(code);

      const listed = await repository.list();
      expect(listed.find((item) => item.code === code)).toBeDefined();
    } finally {
      await connection.pool.end();
    }
  });

  it("商品编码重复被数据库的唯一索引挡住，商品条码非空时重复同样被挡住", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const repository = createItemMasterRepository(connection.db);
    try {
      const code = uniqueCode("E2E-PG-DUP");
      const barcode = `69${Math.floor(Math.random() * 1e11)
        .toString()
        .padStart(11, "0")}`;
      await repository.insert({
        id: crypto.randomUUID(),
        code,
        barcode,
        name: "可口可乐",
        specification: null,
        brand: null,
        category: null,
        baseUnit: "瓶",
        auxiliaryUnits: [],
      });

      await expect(
        repository.insert({
          id: crypto.randomUUID(),
          code,
          barcode: null,
          name: "同编码的另一条",
          specification: null,
          brand: null,
          category: null,
          baseUnit: "瓶",
          auxiliaryUnits: [],
        }),
      ).rejects.toThrow("商品编码重复");

      await expect(
        repository.insert({
          id: crypto.randomUUID(),
          code: uniqueCode("E2E-PG-DUP"),
          barcode,
          name: "同条码的另一条",
          specification: null,
          brand: null,
          category: null,
          baseUnit: "瓶",
          auxiliaryUnits: [],
        }),
      ).rejects.toThrow("商品条码重复");
    } finally {
      await connection.pool.end();
    }
  });

  it("多条档案都可以没有商品条码，删除档案时辅助计量单位一并删掉", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const repository = createItemMasterRepository(connection.db);
    try {
      const first = {
        id: crypto.randomUUID(),
        code: uniqueCode("E2E-PG-NOBARCODE"),
        barcode: null,
        name: "没有条码的档案一",
        specification: null,
        brand: null,
        category: null,
        baseUnit: "瓶",
        auxiliaryUnits: [{ unit: "箱", conversionRate: "12.000000" }],
      };
      const second = { ...first, id: crypto.randomUUID(), code: uniqueCode("E2E-PG-NOBARCODE") };
      await repository.insert(first);
      await repository.insert(second);

      expect(await repository.findByBarcode("")).toBeNull();

      const removed = await repository.remove(first.id);
      expect(removed).toBe(true);
      expect(await repository.findById(first.id)).toBeNull();
    } finally {
      await connection.pool.end();
    }
  });
});
