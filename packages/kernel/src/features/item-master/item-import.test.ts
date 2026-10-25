import { describe, expect, it } from "vitest";
import { createInMemoryTransactionRunner } from "../../shared/transactions/index.js";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions/index.js";
import { parseItemImportCsv } from "./csv.js";
import { ItemBatchError } from "./errors.js";
import { createInMemoryItemMasterRepository } from "./in-memory-repository.js";
import { createItemImportService } from "./import-service.js";
import { createItemMasterService } from "./service.js";

const HEADER =
  "code,barcode,name,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate";

const row = (...fields: string[]): string => fields.join(",");

const csv = (...rows: string[]): string => [HEADER, ...rows].join("\n");

const createImport = () => {
  const repository = createInMemoryItemMasterRepository();
  let counter = 0;
  const items = createItemMasterService(repository, { idGenerator: () => `id-${++counter}` });
  const service = createItemImportService({ items, runner: createInMemoryTransactionRunner() });
  return { repository, service };
};

const errorOf = async (action: () => Promise<unknown>): Promise<ItemBatchError> => {
  try {
    await action();
  } catch (error) {
    if (error instanceof ItemBatchError) {
      return error;
    }
    throw error;
  }
  throw new Error("期望导入失败，但导入成功了");
};

describe("商品批量导入的 CSV 解析", () => {
  it("表头固定为 code,barcode,name,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate", () => {
    const rows = parseItemImportCsv(
      csv(row("SKU-1", "6900000000001", "可乐", "500ml", "可口可乐", "饮料", "瓶", "", "", "", "")),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.line).toBe(2);
    expect(rows[0]?.input).toEqual({
      code: "SKU-1",
      barcode: "6900000000001",
      name: "可乐",
      specification: "500ml",
      brand: "可口可乐",
      category: "饮料",
      baseUnit: "瓶",
      auxiliaryUnits: [],
    });
  });

  it("表头少了列时报出缺了哪几列", () => {
    const error = (() => {
      try {
        parseItemImportCsv("code,barcode,name\nSKU-1,,可乐");
        return undefined;
      } catch (caught) {
        return caught as ItemBatchError;
      }
    })();

    expect(error?.message).toContain("表头不匹配");
    expect(error?.message).toContain("缺少");
    expect(error?.message).toContain("baseUnit");
  });

  it("表头多了列时报出多出了哪几列", () => {
    const error = (() => {
      try {
        parseItemImportCsv(`${HEADER},extra\nSKU-1,,可乐,,,,,瓶,,,,`);
        return undefined;
      } catch (caught) {
        return caught as ItemBatchError;
      }
    })();

    expect(error?.message).toContain("多出");
    expect(error?.message).toContain("extra");
  });

  it("表头列名相同但顺序不对时报出顺序要求", () => {
    const error = (() => {
      try {
        parseItemImportCsv(
          "name,code,barcode,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate",
        );
        return undefined;
      } catch (caught) {
        return caught as ItemBatchError;
      }
    })();

    expect(error?.message).toContain("表头不匹配");
    expect(error?.message).toContain("顺序");
  });

  it("字段里的逗号、双引号、转义双引号与换行都能正确解析", () => {
    const rows = parseItemImportCsv(
      [
        HEADER,
        row("SKU-1", "", '"可乐,大瓶"', "", "", "", "瓶", "", "", "", ""),
        row("SKU-2", "", '"他说""好"""', "", "", "", "瓶", "", "", "", ""),
        row("SKU-3", "", '"第一行\n第二行"', "", "", "", "瓶", "", "", "", ""),
      ].join("\n"),
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]?.input.name).toBe("可乐,大瓶");
    expect(rows[1]?.input.name).toBe('他说"好"');
    expect(rows[2]?.input.name).toBe("第一行\n第二行");
    expect(rows[2]?.line).toBe(4);
  });

  it("未加引号的字段里出现双引号时按字面量处理", () => {
    const rows = parseItemImportCsv(
      csv(row("SKU-1", "", '他说"好"', "", "", "", "瓶", "", "", "", "")),
    );

    expect(rows[0]?.input.name).toBe('他说"好"');
  });

  it("引号没有闭合时整批失败并指出所在行号", async () => {
    const error = await errorOf(async () =>
      parseItemImportCsv(
        `${HEADER}\n${row("SKU-1", "", '"未闭合', "", "", "", "瓶", "", "", "", "")}`,
      ),
    );

    expect(error.message).toContain("引号没有闭合");
    expect(error.details[0]?.line).toBe(2);
  });

  it("列数与表头不一致时报出所在行号", async () => {
    const error = await errorOf(async () =>
      parseItemImportCsv(
        csv(row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", ""), "SKU-2,,可乐"),
      ),
    );

    expect(error.details).toEqual([
      { line: 3, code: "VALIDATION", message: "列数不匹配：期望 11 列，实际 3 列" },
    ]);
  });

  it("空行被忽略，末尾换行不产生多余行", () => {
    const rows = parseItemImportCsv(
      `${HEADER}\n\n${row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", "")}\n\n`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.line).toBe(3);
  });
});

describe("商品批量导入的批次编排", () => {
  it("每行都合法的 CSV 整批导入成功，导入条数与数据行数一致", async () => {
    const { repository, service } = createImport();

    const result = await service.importCsv(
      csv(
        row("SKU-1", "6900000000001", "可乐", "", "", "", "瓶", "箱", "12", "", ""),
        row("SKU-2", "6900000000002", "雪碧", "", "", "", "瓶", "", "", "", ""),
      ),
    );

    expect(result.count).toBe(2);
    expect(result.items.map((item) => item.code)).toEqual(["SKU-1", "SKU-2"]);
    expect(await repository.list()).toHaveLength(2);
    expect(result.items[0]?.auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "12.000000" }]);
  });

  it("有一行不合法时整批失败，合法行也不落库，并逐行给出行号与原因", async () => {
    const { repository, service } = createImport();

    const error = await errorOf(() =>
      service.importCsv(
        csv(
          row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", ""),
          row("SKU-2", "", "", "", "", "", "瓶", "", "", "", ""),
          row("SKU-3", "", "雪碧", "", "", "", "瓶", "", "", "", ""),
        ),
      ),
    );

    expect(error.details).toEqual([{ line: 3, code: "VALIDATION", message: "缺少商品名称" }]);
    expect(error.code).toBe("VALIDATION");
    expect(await repository.list()).toEqual([]);
  });

  it("换算率非正数与小数位超限的行各自按行报错", async () => {
    const { service } = createImport();

    const error = await errorOf(() =>
      service.importCsv(
        csv(
          row("SKU-1", "", "可乐", "", "", "", "瓶", "箱", "0", "", ""),
          row("SKU-2", "", "雪碧", "", "", "", "瓶", "箱", "1.1234567", "", ""),
        ),
      ),
    );

    expect(error.details).toEqual([
      { line: 2, code: "VALIDATION", message: "单位换算率必须为正数：0" },
      { line: 3, code: "VALIDATION", message: "单位换算率最多 6 位小数：1.1234567" },
    ]);
  });

  it("换算率为空的行指出缺少单位换算率，与填了非正数区分开", async () => {
    const { service } = createImport();

    const error = await errorOf(() =>
      service.importCsv(
        csv(
          row("SKU-1", "", "可乐", "", "", "", "瓶", "箱", "", "", ""),
          row("SKU-2", "", "雪碧", "", "", "", "瓶", "箱", "-1", "", ""),
        ),
      ),
    );

    expect(error.details).toEqual([
      { line: 2, code: "VALIDATION", message: "缺少单位换算率" },
      { line: 3, code: "VALIDATION", message: "单位换算率必须为正数：-1" },
    ]);
  });

  it("同一份 CSV 里重复的商品编码归到后出现的那一行", async () => {
    const { service } = createImport();

    const error = await errorOf(() =>
      service.importCsv(
        csv(
          row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", ""),
          row("SKU-1", "", "雪碧", "", "", "", "瓶", "", "", "", ""),
        ),
      ),
    );

    expect(error.details).toEqual([{ line: 3, code: "DUPLICATE", message: "商品编码重复：SKU-1" }]);
  });

  it("同一份 CSV 第二次导入整批失败，并逐行指出商品编码已存在", async () => {
    const { service } = createImport();
    const text = csv(
      row("SKU-1", "6900000000001", "可乐", "", "", "", "瓶", "", "", "", ""),
      row("SKU-2", "6900000000002", "雪碧", "", "", "", "瓶", "", "", "", ""),
    );
    await service.importCsv(text);

    const error = await errorOf(() => service.importCsv(text));

    expect(error.details).toEqual([
      { line: 2, code: "DUPLICATE", message: "商品编码重复：SKU-1" },
      { line: 3, code: "DUPLICATE", message: "商品编码重复：SKU-2" },
    ]);
    expect(error.code).toBe("DUPLICATE");
  });

  it("导入只新建不更新：已存在的商品不会被改写", async () => {
    const { repository, service } = createImport();
    await service.importCsv(csv(row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", "")));

    await errorOf(() =>
      service.importCsv(csv(row("SKU-1", "", "新名字", "", "", "", "瓶", "", "", "", ""))),
    );

    const stored = await repository.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.name).toBe("可乐");
  });

  it("整批导入只开一个事务，批量建档复用外层上下文不再另起事务", async () => {
    const repository = createInMemoryItemMasterRepository();
    const transactionIds: string[] = [];
    const runner: TransactionRunner = {
      async run(work) {
        const context: TransactionContext = {
          transactionId: `tx-${transactionIds.length + 1}`,
          handle: `handle-${transactionIds.length + 1}`,
        };
        transactionIds.push(context.transactionId);
        return work(context);
      },
    };
    const items = createItemMasterService(repository, { runner });
    const service = createItemImportService({ items, runner });

    await service.importCsv(
      csv(
        row("SKU-1", "", "可乐", "", "", "", "瓶", "箱", "12", "", ""),
        row("SKU-2", "", "雪碧", "", "", "", "瓶", "", "", "", ""),
      ),
    );

    expect(transactionIds).toEqual(["tx-1"]);
    expect(await repository.list()).toHaveLength(2);
  });
});
