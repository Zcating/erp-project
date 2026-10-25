import { describe, expect, it } from "vitest";
import {
  createItemImportService,
  createItemMasterService,
  ItemBatchError,
} from "@erp-inventory-sales/kernel";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createTransactionRunner } from "../src/db/transactions.js";
import { createItemMasterRepository } from "../src/features/item-master/repository.js";

const HEADER =
  "code,barcode,name,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate";

const row = (...fields: string[]): string => fields.join(",");

const csv = (...rows: string[]): string => [HEADER, ...rows].join("\n");

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const uniqueBarcode = (): string =>
  `69${Math.floor(Math.random() * 1e11)
    .toString()
    .padStart(11, "0")}`;

describe("端到端：商品批量导入（Postgres 适配器）", () => {
  it("整批合法时全部落库，辅助计量单位与换算率一并写入", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    try {
      const repository = createItemMasterRepository(connection.db);
      const items = createItemMasterService(repository);
      const service = createItemImportService({
        items,
        runner: createTransactionRunner(connection.db),
      });
      const code = uniqueCode("E2E-PG-IMPORT");
      const barcode = uniqueBarcode();

      const result = await service.importCsv(
        csv(
          row(code, barcode, "可乐", "", "", "", "瓶", "箱", "12", "", ""),
          row(`${code}-B`, uniqueBarcode(), "雪碧", "", "", "", "瓶", "", "", "", ""),
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

  it("一行不合法时整批失败，数据库里一条都没落，合法行也不落库", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    try {
      const repository = createItemMasterRepository(connection.db);
      const items = createItemMasterService(repository);
      const service = createItemImportService({
        items,
        runner: createTransactionRunner(connection.db),
      });
      const code = uniqueCode("E2E-PG-IMPORT-ATOMIC");

      const error = await service
        .importCsv(
          csv(
            row(code, uniqueBarcode(), "可乐", "", "", "", "瓶", "", "", "", ""),
            row(`${code}-B`, uniqueBarcode(), "", "", "", "", "瓶", "", "", "", ""),
          ),
        )
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(ItemBatchError);
      expect((error as ItemBatchError).details).toEqual([
        { line: 3, code: "VALIDATION", message: "缺少商品名称" },
      ]);
      expect(await repository.findByCode(code)).toBeNull();
      expect(await repository.findByCode(`${code}-B`)).toBeNull();
    } finally {
      await connection.pool.end();
    }
  });

  it("同一份 CSV 导入第二次时整批失败，并逐行指出商品编码已存在", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    try {
      const repository = createItemMasterRepository(connection.db);
      const items = createItemMasterService(repository);
      const service = createItemImportService({
        items,
        runner: createTransactionRunner(connection.db),
      });
      const code = uniqueCode("E2E-PG-IMPORT-DUP");
      const text = csv(
        row(code, uniqueBarcode(), "可乐", "", "", "", "瓶", "", "", "", ""),
        row(`${code}-B`, uniqueBarcode(), "雪碧", "", "", "", "瓶", "", "", "", ""),
      );
      await service.importCsv(text);

      const error = await service.importCsv(text).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(ItemBatchError);
      expect((error as ItemBatchError).code).toBe("DUPLICATE");
      expect((error as ItemBatchError).details).toEqual([
        { line: 2, code: "DUPLICATE", message: `商品编码重复：${code}` },
        { line: 3, code: "DUPLICATE", message: `商品编码重复：${code}-B` },
      ]);
      expect(await repository.findByCode(code)).not.toBeNull();
    } finally {
      await connection.pool.end();
    }
  });
});
