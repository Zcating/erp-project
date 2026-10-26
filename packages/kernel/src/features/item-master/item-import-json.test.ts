import { describe, expect, it } from "vitest";
import { createInMemoryTransactionRunner } from "../../shared/transactions/index.js";
import { parseItemImportCsv } from "./csv.js";
import { ItemBatchError } from "./errors.js";
import { createInMemoryItemMasterRepository } from "./in-memory-repository.js";
import { createItemImportService } from "./import-service.js";
import { parseItemImportJson } from "./json.js";
import { createItemMasterService } from "./service.js";

const HEADER =
  "code,barcode,name,spec,brand,category,baseUnit,auxUnit1,auxUnit1Rate,auxUnit2,auxUnit2Rate";

const row = (...fields: string[]): string => fields.join(",");

const csv = (...rows: string[]): string => [HEADER, ...rows].join("\n");

const json = (...records: Array<Record<string, unknown>>): string => JSON.stringify(records);

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

describe("商品批量导入的 JSON 解析", () => {
  it("字段与 CSV 表头一一对应，解析出的商品档案输入相同", () => {
    const csvRows = parseItemImportCsv(
      csv(
        row(
          "SKU-1",
          "6900000000001",
          "可乐",
          "500ml",
          "可口可乐",
          "饮料",
          "瓶",
          "箱",
          "12",
          "",
          "",
        ),
      ),
    );

    const jsonRows = parseItemImportJson(
      json({
        code: "SKU-1",
        barcode: "6900000000001",
        name: "可乐",
        spec: "500ml",
        brand: "可口可乐",
        category: "饮料",
        baseUnit: "瓶",
        auxUnit1: "箱",
        auxUnit1Rate: "12",
        auxUnit2: "",
        auxUnit2Rate: "",
      }),
    );

    expect(jsonRows).toHaveLength(1);
    expect(jsonRows[0]?.line).toBe(1);
    expect(jsonRows[0]?.input).toEqual(csvRows[0]?.input);
  });

  it("序号按数组中的位置给出，第 1 条是 1", () => {
    const rows = parseItemImportJson(
      json(
        { code: "SKU-1", name: "可乐", baseUnit: "瓶" },
        { code: "SKU-2", name: "雪碧", baseUnit: "瓶" },
      ),
    );

    expect(rows.map((row) => row.line)).toEqual([1, 2]);
  });

  it("缺省字段按空值处理，交给商品档案规则判定", () => {
    const rows = parseItemImportJson(json({ code: "SKU-1", name: "可乐", baseUnit: "瓶" }));

    expect(rows[0]?.input).toEqual({
      code: "SKU-1",
      barcode: "",
      name: "可乐",
      specification: "",
      brand: "",
      category: "",
      baseUnit: "瓶",
      auxiliaryUnits: [],
    });
  });

  it("文档不是数组时整批失败并说明要求", async () => {
    const error = await errorOf(async () => parseItemImportJson(JSON.stringify({ code: "SKU-1" })));

    expect(error.message).toContain("商品对象数组");
    expect(error.code).toBe("VALIDATION");
  });

  it("空数组时报出没有商品记录", async () => {
    const error = await errorOf(async () => parseItemImportJson("[]"));

    expect(error.message).toContain("没有商品记录");
  });

  it("JSON 语法错误时整批失败并指出位置", async () => {
    const error = await errorOf(async () => parseItemImportJson('{"code": "SKU-1",}'));

    expect(error.message).toContain("JSON 解析失败");
    expect(error.message).toContain("位置");
    expect(error.code).toBe("VALIDATION");
  });

  it("多余字段逐条报错并指出字段名", async () => {
    const error = await errorOf(async () =>
      parseItemImportJson(json({ code: "SKU-1", name: "可乐", baseUnit: "瓶", sku: "X" })),
    );

    expect(error.details).toEqual([{ line: 1, code: "VALIDATION", message: "多余字段：sku" }]);
  });

  it("字段值不是字符串或数字时逐条报错", async () => {
    const error = await errorOf(async () =>
      parseItemImportJson(json({ code: "SKU-1", name: ["可乐"], baseUnit: "瓶" })),
    );

    expect(error.details).toEqual([
      { line: 1, code: "VALIDATION", message: "字段 name 必须是字符串" },
    ]);
  });
});

describe("商品批量导入的 JSON 批次编排", () => {
  it("每条都合法的 JSON 整批导入成功，导入条数与记录条数一致", async () => {
    const { repository, service } = createImport();

    const result = await service.importJson(
      json(
        {
          code: "SKU-1",
          barcode: "6900000000001",
          name: "可乐",
          baseUnit: "瓶",
          auxUnit1: "箱",
          auxUnit1Rate: "12",
        },
        { code: "SKU-2", barcode: "6900000000002", name: "雪碧", baseUnit: "瓶" },
      ),
    );

    expect(result.count).toBe(2);
    expect(result.items.map((item) => item.code)).toEqual(["SKU-1", "SKU-2"]);
    expect(await repository.list()).toHaveLength(2);
    expect(result.items[0]?.auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "12.000000" }]);
  });

  it("有一条不合法时整批失败，合法记录也不落库，并逐条给出第几条与原因", async () => {
    const { repository, service } = createImport();

    const error = await errorOf(() =>
      service.importJson(
        json(
          { code: "SKU-1", name: "可乐", baseUnit: "瓶" },
          { code: "SKU-2", name: "", baseUnit: "瓶" },
          { code: "SKU-3", name: "雪碧", baseUnit: "瓶" },
        ),
      ),
    );

    expect(error.details).toEqual([
      { line: 2, code: "VALIDATION", message: "第 2 条：缺少商品名称" },
    ]);
    expect(error.code).toBe("VALIDATION");
    expect(await repository.list()).toEqual([]);
  });

  it("换算率非正数与小数位超限的记录各自按条报错", async () => {
    const { service } = createImport();

    const error = await errorOf(() =>
      service.importJson(
        json(
          { code: "SKU-1", name: "可乐", baseUnit: "瓶", auxUnit1: "箱", auxUnit1Rate: "0" },
          {
            code: "SKU-2",
            name: "雪碧",
            baseUnit: "瓶",
            auxUnit1: "箱",
            auxUnit1Rate: "1.1234567",
          },
        ),
      ),
    );

    expect(error.details).toEqual([
      { line: 1, code: "VALIDATION", message: "第 1 条：单位换算率必须为正数：0" },
      { line: 2, code: "VALIDATION", message: "第 2 条：单位换算率最多 6 位小数：1.1234567" },
    ]);
  });

  it("条码重复按条报错", async () => {
    const { service } = createImport();

    const error = await errorOf(() =>
      service.importJson(
        json(
          { code: "SKU-1", barcode: "6900000000001", name: "可乐", baseUnit: "瓶" },
          { code: "SKU-2", barcode: "6900000000001", name: "雪碧", baseUnit: "瓶" },
        ),
      ),
    );

    expect(error.details).toEqual([
      { line: 2, code: "DUPLICATE", message: "第 2 条：商品条码重复：6900000000001" },
    ]);
    expect(error.code).toBe("DUPLICATE");
  });

  it("同一份 JSON 第二次导入整批失败，并逐条指出商品编码已存在", async () => {
    const { service } = createImport();
    const text = json(
      { code: "SKU-1", barcode: "6900000000001", name: "可乐", baseUnit: "瓶" },
      { code: "SKU-2", barcode: "6900000000002", name: "雪碧", baseUnit: "瓶" },
    );
    await service.importJson(text);

    const error = await errorOf(() => service.importJson(text));

    expect(error.details).toEqual([
      { line: 1, code: "DUPLICATE", message: "第 1 条：商品编码重复：SKU-1" },
      { line: 2, code: "DUPLICATE", message: "第 2 条：商品编码重复：SKU-2" },
    ]);
    expect(error.code).toBe("DUPLICATE");
  });

  it("导入只新建不更新：已存在的商品不会被改写", async () => {
    const { repository, service } = createImport();
    await service.importJson(json({ code: "SKU-1", name: "可乐", baseUnit: "瓶" }));

    await errorOf(() =>
      service.importJson(json({ code: "SKU-1", name: "新名字", baseUnit: "瓶" })),
    );

    const stored = await repository.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.name).toBe("可乐");
  });

  it("同一批商品分别用 CSV 与 JSON 导入，导入结果完全一致", async () => {
    const csvImport = createImport();
    const jsonImport = createImport();

    const csvResult = await csvImport.service.importCsv(
      csv(
        row(
          "SKU-1",
          "6900000000001",
          "可乐",
          "500ml",
          "可口可乐",
          "饮料",
          "瓶",
          "箱",
          "12",
          "",
          "",
        ),
        row("SKU-2", "6900000000002", "雪碧", "", "", "", "瓶", "", "", "", ""),
      ),
    );

    const jsonResult = await jsonImport.service.importJson(
      json(
        {
          code: "SKU-1",
          barcode: "6900000000001",
          name: "可乐",
          spec: "500ml",
          brand: "可口可乐",
          category: "饮料",
          baseUnit: "瓶",
          auxUnit1: "箱",
          auxUnit1Rate: "12",
        },
        { code: "SKU-2", barcode: "6900000000002", name: "雪碧", baseUnit: "瓶" },
      ),
    );

    expect(jsonResult.count).toBe(csvResult.count);
    expect(jsonResult.items).toEqual(csvResult.items);
    expect(await jsonImport.repository.list()).toEqual(await csvImport.repository.list());
  });

  it("同一批商品分别用 CSV 与 JSON 导入，报错语义一致", async () => {
    const csvImport = createImport();
    const jsonImport = createImport();

    const csvError = await errorOf(() =>
      csvImport.service.importCsv(
        csv(
          row("SKU-1", "", "可乐", "", "", "", "瓶", "", "", "", ""),
          row("SKU-2", "", "", "", "", "", "瓶", "", "", "", ""),
          row("SKU-3", "", "雪碧", "", "", "", "瓶", "箱", "0", "", ""),
        ),
      ),
    );

    const jsonError = await errorOf(() =>
      jsonImport.service.importJson(
        json(
          { code: "SKU-1", name: "可乐", baseUnit: "瓶" },
          { code: "SKU-2", name: "", baseUnit: "瓶" },
          { code: "SKU-3", name: "雪碧", baseUnit: "瓶", auxUnit1: "箱", auxUnit1Rate: "0" },
        ),
      ),
    );

    expect(jsonError.code).toBe(csvError.code);
    expect(jsonError.details.map((detail) => detail.code)).toEqual(
      csvError.details.map((detail) => detail.code),
    );
    expect(jsonError.details.map((detail) => detail.message.replace(/^第 \d+ 条：/, ""))).toEqual(
      csvError.details.map((detail) => detail.message),
    );
  });
});
