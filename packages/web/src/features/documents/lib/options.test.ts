import { describe, expect, it } from "vitest";
import type { ItemMaster } from "../../items/lib/api";
import type { Document } from "./api";
import {
  documentStatusFilterOptions,
  documentStatusOptions,
  documentTypeFilterOptions,
  documentTypeOptions,
  originalLineChoices,
} from "./options";

const item: ItemMaster = {
  id: "item-1",
  code: "SKU-1",
  barcode: null,
  name: "可口可乐",
  specification: null,
  brand: null,
  category: null,
  baseUnit: "瓶",
  auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
};

const inbound: Document = {
  id: "doc-1",
  documentNo: "PIN-001",
  type: "PURCHASE_INBOUND",
  status: "POSTED",
  supplierId: "sup-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "wh-1",
  warehouseId: null,
  lines: [
    {
      id: "line-1",
      lineNo: 1,
      itemId: "item-1",
      quantity: "10",
      unitPrice: "2",
      amount: "20",
      originalLineId: null,
    },
  ],
};

describe("单据域的候选集构造", () => {
  it("原单据行选项是「单号 第 行号 行 商品（已出 数量）」，取值是行标识", () => {
    const choices = originalLineChoices(
      [inbound],
      [item],
      "已出",
      (document) => document.sourceWarehouseId ?? "",
    );

    expect(choices).toEqual([
      {
        value: "line-1",
        label: "PIN-001 第 1 行 SKU-1 可口可乐（已出 10）",
        itemId: "item-1",
        warehouseId: "",
      },
    ]);
  });

  it("原单据行选项带出取原单据的仓库", () => {
    const choices = originalLineChoices(
      [inbound],
      [item],
      "已入",
      (document) => document.targetWarehouseId ?? "",
    );

    expect(choices[0]?.warehouseId).toBe("wh-1");
    expect(choices[0]?.label).toBe("PIN-001 第 1 行 SKU-1 可口可乐（已入 10）");
  });

  it("单据类型选项的取值是类型标识、文案是中文名，没有空值项", () => {
    expect(documentTypeOptions(["PURCHASE_INBOUND", "STOCKTAKE"])).toEqual([
      { value: "PURCHASE_INBOUND", label: "采购入库单" },
      { value: "STOCKTAKE", label: "盘点单" },
    ]);
  });

  it("单据状态选项的取值是状态标识、文案是中文名，没有空值项", () => {
    expect(documentStatusOptions()).toEqual([
      { value: "DRAFT", label: "草稿" },
      { value: "POSTED", label: "已过账" },
      { value: "VOIDED", label: "已作废" },
    ]);
  });

  it("单据类型筛选选项首项是空值项「全部类型」", () => {
    expect(documentTypeFilterOptions(["STOCKTAKE"])).toEqual([
      { value: "", label: "全部类型" },
      { value: "STOCKTAKE", label: "盘点单" },
    ]);
  });

  it("单据状态筛选选项首项是空值项「全部状态」", () => {
    expect(documentStatusFilterOptions()).toEqual([
      { value: "", label: "全部状态" },
      { value: "DRAFT", label: "草稿" },
      { value: "POSTED", label: "已过账" },
      { value: "VOIDED", label: "已作废" },
    ]);
  });
});
