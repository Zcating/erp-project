import { createItemImportService, createItemMasterService } from "@erp-inventory-sales/kernel";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createTransactionRunner } from "../src/db/transactions.js";
import { createItemMasterRepository } from "../src/features/item-master/repository.js";

const HEADER =
  "code,barcode,name,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate";

const row = (...fields: string[]): string => fields.join(",");

const OVER_WIDTH_CONVERSION_RATE = "10000000000000.000000";

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const errorCodeOf = (error: unknown): string | undefined => {
  const outer = error as { code?: unknown; cause?: { code?: unknown } } | null;
  if (outer === null || typeof outer !== "object") {
    return undefined;
  }
  if (typeof outer.code === "string") {
    return outer.code;
  }
  const cause = outer.cause;
  if (cause !== undefined && cause !== null && typeof cause.code === "string") {
    return cause.code;
  }
  return undefined;
};

describe("端到端：商品建档的原子性（Postgres 适配器）", () => {
  it("直接调适配器写入超出 erp.conversion_rate 宽度的换算率时辅助单位写入失败，商品行一并回滚，不留孤儿档案", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const repository = createItemMasterRepository(connection.db);
    try {
      const code = uniqueCode("E2E-PG-ATOMIC");
      const id = crypto.randomUUID();

      const error = await repository
        .insert({
          id,
          code,
          barcode: null,
          name: "换算率超宽的档案",
          specification: null,
          brand: null,
          category: null,
          baseUnit: "瓶",
          auxiliaryUnits: [{ unit: "箱", conversionRate: OVER_WIDTH_CONVERSION_RATE }],
        })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(error).toBeDefined();
      expect(errorCodeOf(error)).toBe("22003");
      expect(await repository.findById(id)).toBeNull();
      expect(await repository.findByCode(code)).toBeNull();
    } finally {
      await connection.pool.end();
    }
  });

  it("服务建档时辅助单位写入失败，商品行一并回滚，不留孤儿档案", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const repository = createItemMasterRepository(connection.db);
    try {
      const service = createItemMasterService(repository, {
        runner: createTransactionRunner(connection.db),
      });
      const code = uniqueCode("E2E-PG-ATOMIC-SVC");

      const error = await service
        .create({
          code,
          barcode: null,
          name: "换算率超宽的档案",
          specification: null,
          brand: null,
          category: null,
          baseUnit: "瓶",
          auxiliaryUnits: [{ unit: "箱", conversionRate: OVER_WIDTH_CONVERSION_RATE }],
        })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(error).toBeDefined();
      expect(errorCodeOf(error)).toBe("22003");
      expect(await repository.findByCode(code)).toBeNull();
    } finally {
      await connection.pool.end();
    }
  });

  it("批量导入中某行的辅助单位写入失败时整批回滚，数据库里一条都没落", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const repository = createItemMasterRepository(connection.db);
    try {
      const runner = createTransactionRunner(connection.db);
      const items = createItemMasterService(repository, { runner });
      const service = createItemImportService({ items, runner });
      const code = uniqueCode("E2E-PG-ATOMIC-IMPORT");

      const error = await service
        .importCsv(
          [
            HEADER,
            row(code, "", "可乐", "", "", "", "瓶", "箱", "12", "", ""),
            row(
              `${code}-B`,
              "",
              "雪碧",
              "",
              "",
              "",
              "瓶",
              "箱",
              OVER_WIDTH_CONVERSION_RATE,
              "",
              "",
            ),
          ].join("\n"),
        )
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(error).toBeDefined();
      expect(errorCodeOf(error)).toBe("22003");
      expect(await repository.findByCode(code)).toBeNull();
      expect(await repository.findByCode(`${code}-B`)).toBeNull();
    } finally {
      await connection.pool.end();
    }
  });

  it("编辑档案时辅助单位写入失败，改名与换算率都不落库，档案保持原样", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const repository = createItemMasterRepository(connection.db);
    try {
      const service = createItemMasterService(repository, {
        runner: createTransactionRunner(connection.db),
      });
      const code = uniqueCode("E2E-PG-ATOMIC-UPDATE");
      const created = await service.create({
        code,
        barcode: null,
        name: "原来的名字",
        specification: null,
        brand: null,
        category: null,
        baseUnit: "瓶",
        auxiliaryUnits: [{ unit: "箱", conversionRate: "12.000000" }],
      });

      const error = await service
        .update(created.id, {
          code,
          barcode: null,
          name: "改过的名字",
          specification: null,
          brand: null,
          category: null,
          baseUnit: "瓶",
          auxiliaryUnits: [{ unit: "箱", conversionRate: OVER_WIDTH_CONVERSION_RATE }],
        })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(error).toBeDefined();
      expect(errorCodeOf(error)).toBe("22003");
      const stored = await repository.findById(created.id);
      expect(stored?.name).toBe("原来的名字");
      expect(stored?.auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "12.000000" }]);
    } finally {
      await connection.pool.end();
    }
  });
});
