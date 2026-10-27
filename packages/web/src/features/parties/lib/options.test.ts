import { describe, expect, it } from "vitest";
import type { Customer, Supplier, Warehouse } from "./api";
import {
  customerOptions,
  supplierOptions,
  warehouseOptionsWithCode,
  warehouseOptionsWithoutCode,
} from "./options";

const warehouse: Warehouse = {
  id: "wh-1",
  code: "WH-1",
  name: "杭州总仓",
  purpose: null,
};

const supplier: Supplier = {
  id: "sup-1",
  code: "SUP-1",
  name: "可口可乐（中国）饮料有限公司",
  contact: null,
};

const customer: Customer = {
  id: "cus-1",
  code: "CUS-1",
  name: "杭州百货大楼",
  contact: null,
};

describe("参与方候选项构造", () => {
  it("带编码的仓库候选项文案是「编码 名称」，取值是仓库标识", () => {
    expect(warehouseOptionsWithCode([warehouse])).toEqual([
      { value: "wh-1", label: "WH-1 杭州总仓" },
    ]);
  });

  it("只有名称的仓库候选项文案是仓库名称本身，取值是仓库标识", () => {
    expect(warehouseOptionsWithoutCode([warehouse])).toEqual([
      { value: "wh-1", label: "杭州总仓" },
    ]);
  });

  it("供应商候选项文案是「编码 名称」，取值是供应商标识", () => {
    expect(supplierOptions([supplier])).toEqual([
      { value: "sup-1", label: "SUP-1 可口可乐（中国）饮料有限公司" },
    ]);
  });

  it("客户候选项文案是「编码 名称」，取值是客户标识", () => {
    expect(customerOptions([customer])).toEqual([{ value: "cus-1", label: "CUS-1 杭州百货大楼" }]);
  });

  it("调用处把空值项放在候选列表第一位", () => {
    expect([{ value: "", label: "请选择仓库" }, ...warehouseOptionsWithCode([warehouse])]).toEqual([
      { value: "", label: "请选择仓库" },
      { value: "wh-1", label: "WH-1 杭州总仓" },
    ]);
    expect([{ value: "", label: "全部仓库" }, ...warehouseOptionsWithoutCode([warehouse])]).toEqual(
      [
        { value: "", label: "全部仓库" },
        { value: "wh-1", label: "杭州总仓" },
      ],
    );
  });
});
