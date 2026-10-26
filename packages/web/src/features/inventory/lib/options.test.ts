import { describe, expect, it } from "vitest";
import type { ItemMaster } from "../../items/lib/api";
import type { Warehouse } from "../../parties/lib/api";
import { itemOptions, movementOrderOptions, warehouseOptions } from "./options";

const warehouse: Warehouse = {
  id: "wh-1",
  code: "WH-1",
  name: "杭州总仓",
  purpose: null,
};

const item: ItemMaster = {
  id: "item-1",
  code: "SKU-1",
  barcode: null,
  name: "可口可乐",
  specification: null,
  brand: null,
  category: null,
  baseUnit: "瓶",
  auxiliaryUnits: [],
};

describe("库存域的候选集构造", () => {
  it("仓库选项的文案是仓库名称本身，取值是仓库标识，首项是「全部仓库」", () => {
    expect(warehouseOptions([warehouse])).toEqual([
      { value: "", label: "全部仓库" },
      { value: "wh-1", label: "杭州总仓" },
    ]);
  });

  it("商品选项的文案是「编码 名称」，取值是商品标识，首项是「全部商品」", () => {
    expect(itemOptions([item])).toEqual([
      { value: "", label: "全部商品" },
      { value: "item-1", label: "SKU-1 可口可乐" },
    ]);
  });

  it("排序方向选项没有空值项，正序是 asc、倒序是 desc", () => {
    expect(movementOrderOptions()).toEqual([
      { value: "asc", label: "时间正序" },
      { value: "desc", label: "时间倒序" },
    ]);
  });
});
