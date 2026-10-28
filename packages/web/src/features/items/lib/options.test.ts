import { describe, expect, it } from "vitest";
import type { ItemMaster } from "../../../server/items";
import { itemOptions, unitNames, unitOptions } from "./options";

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

describe("商品候选项构造", () => {
  it("商品候选项的文案是「编码 名称」，取值是商品标识", () => {
    expect(itemOptions([item])).toEqual([{ value: "item-1", label: "SKU-1 可口可乐" }]);
  });

  it("单位候选项的取值与文案都是单位本身，含基本单位与辅助单位", () => {
    expect(unitOptions(item)).toEqual([
      { value: "瓶", label: "瓶" },
      { value: "箱", label: "箱" },
    ]);
    expect(unitNames(item)).toEqual(["瓶", "箱"]);
  });

  it("没有商品时没有单位候选项", () => {
    expect(unitOptions(undefined)).toEqual([]);
    expect(unitNames(undefined)).toEqual([]);
  });

  it("调用处把空值项放在商品候选列表第一位", () => {
    expect([{ value: "", label: "请选择商品" }, ...itemOptions([item])]).toEqual([
      { value: "", label: "请选择商品" },
      { value: "item-1", label: "SKU-1 可口可乐" },
    ]);
  });
});
