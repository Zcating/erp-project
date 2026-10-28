import { describe, expect, it } from "vitest";
import type { ItemMaster } from "../../../server/items";
import { conversionRateOf } from "./conversion";

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

describe("商品换算率查找", () => {
  it("基本单位的换算率是 1", () => {
    expect(conversionRateOf(item, "瓶")).toBe("1");
  });

  it("辅助单位的换算率是该辅助单位的换算率", () => {
    expect(conversionRateOf(item, "箱")).toBe("12");
  });

  it("单位取不到对应辅助单位时是 1", () => {
    expect(conversionRateOf(item, "件")).toBe("1");
  });

  it("没有商品或没有单位时是 1", () => {
    expect(conversionRateOf(undefined, "瓶")).toBe("1");
    expect(conversionRateOf(item, "")).toBe("1");
  });
});
