import { describe, expect, it } from "vitest";
import {
  createItemImportService,
  createItemMasterService,
  ItemBatchError,
} from "@erp-project/kernel";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createTransactionRunner } from "../src/db/transactions.js";
import { createItemMasterRepository } from "../src/features/item-master/repository.js";

const json = (...records: Array<Record<string, unknown>>): string => JSON.stringify(records);

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const uniqueBarcode = (): string =>
  `69${Math.floor(Math.random() * 1e11)
    .toString()
    .padStart(11, "0")}`;

describe("端到端：商品批量导入（JSON，Postgres 适配器）", () => {
  it("整批合法时全部落库，辅助计量单位与换算率一并写入", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    try {
      const repository = createItemMasterRepository(connection.db);
      const items = createItemMasterService(repository);
      const service = createItemImportService({
        items,
        runner: createTransactionRunner(connection.db),
      });
      const code = uniqueCode("E2E-PG-JSON");
      const barcode = uniqueBarcode();

      const result = await service.importJson(
        json(
          { code, barcode, name: "可乐", baseUnit: "瓶", auxUnit1: "箱", auxUnit1Rate: "12" },
          { code: `${code}-B`, barcode: uniqueBarcode(), name: "雪碧", baseUnit: "瓶" },
        ),
      );

      expect(result.count).toBe(2);
      const stored = await repository.findByCode(code);
      expect(stored?.name).toBe("可乐");
      expect(stored?.barcode).toBe(barcode);
      expect(stored?.auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "12.000000" }]);
      expect(await repository.findByCode(`${code}-B`)).not.toBeNull();
    } finally {
      await connection.pool.end();
    }
  });

  it("一条不合法时整批失败，数据库里一条都没落，合法记录也不落库", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    try {
      const repository = createItemMasterRepository(connection.db);
      const items = createItemMasterService(repository);
      const service = createItemImportService({
        items,
        runner: createTransactionRunner(connection.db),
      });
      const code = uniqueCode("E2E-PG-JSON-ATOMIC");

      const error = await service
        .importJson(
          json(
            { code, barcode: uniqueBarcode(), name: "可乐", baseUnit: "瓶" },
            { code: `${code}-B`, barcode: uniqueBarcode(), name: "", baseUnit: "瓶" },
          ),
        )
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(ItemBatchError);
      expect((error as ItemBatchError).details).toEqual([
        { line: 2, code: "VALIDATION", message: "第 2 条：缺少商品名称" },
      ]);
      expect(await repository.findByCode(code)).toBeNull();
      expect(await repository.findByCode(`${code}-B`)).toBeNull();
    } finally {
      await connection.pool.end();
    }
  });

  it("同一份 JSON 导入第二次时整批失败，并逐条指出商品编码已存在", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    try {
      const repository = createItemMasterRepository(connection.db);
      const items = createItemMasterService(repository);
      const service = createItemImportService({
        items,
        runner: createTransactionRunner(connection.db),
      });
      const code = uniqueCode("E2E-PG-JSON-DUP");
      const text = json(
        { code, barcode: uniqueBarcode(), name: "可乐", baseUnit: "瓶" },
        { code: `${code}-B`, barcode: uniqueBarcode(), name: "雪碧", baseUnit: "瓶" },
      );
      await service.importJson(text);

      const error = await service.importJson(text).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(ItemBatchError);
      expect((error as ItemBatchError).code).toBe("DUPLICATE");
      expect((error as ItemBatchError).details).toEqual([
        { line: 1, code: "DUPLICATE", message: `第 1 条：商品编码重复：${code}` },
        { line: 2, code: "DUPLICATE", message: `第 2 条：商品编码重复：${code}-B` },
      ]);
      expect(await repository.findByCode(code)).not.toBeNull();
    } finally {
      await connection.pool.end();
    }
  });
});
