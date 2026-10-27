import { describe, expect, it } from "vitest";
import { buildItemInput } from "./payload";

const values = {
  code: "SKU-1",
  barcode: "6900000000001",
  name: "可口可乐",
  specification: "500ml/瓶",
  brand: "可口可乐",
  category: "饮料",
  baseUnit: "瓶",
  auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
};

describe("商品档案表单值到提交载荷的转换", () => {
  it("可选字段为空时提交 null", () => {
    const input = buildItemInput({
      ...values,
      barcode: "  ",
      specification: "",
      brand: "   ",
      category: "",
    });

    expect(input.barcode).toBeNull();
    expect(input.specification).toBeNull();
    expect(input.brand).toBeNull();
    expect(input.category).toBeNull();
  });

  it("可选字段有值时提交去掉首尾空白后的值", () => {
    const input = buildItemInput({
      ...values,
      barcode: " 6900000000001 ",
      specification: " 500ml/瓶 ",
      brand: " 可口可乐 ",
      category: " 饮料 ",
    });

    expect(input.barcode).toBe("6900000000001");
    expect(input.specification).toBe("500ml/瓶");
    expect(input.brand).toBe("可口可乐");
    expect(input.category).toBe("饮料");
  });

  it("名称与基本计量单位按原值提交", () => {
    const input = buildItemInput({ ...values, name: " 可口可乐 ", baseUnit: " 瓶 " });

    expect(input.name).toBe(" 可口可乐 ");
    expect(input.baseUnit).toBe(" 瓶 ");
  });

  it("辅助计量单位每项含单位与换算率，换算率保持字符串", () => {
    const input = buildItemInput({
      ...values,
      auxiliaryUnits: [
        { unit: "箱", conversionRate: "12" },
        { unit: "包", conversionRate: "6.5" },
      ],
    });

    expect(input.auxiliaryUnits).toEqual([
      { unit: "箱", conversionRate: "12" },
      { unit: "包", conversionRate: "6.5" },
    ]);
    expect(typeof input.auxiliaryUnits[0]?.conversionRate).toBe("string");
  });

  it("商品编码按原值提交", () => {
    expect(buildItemInput({ ...values, code: " SKU-1 " }).code).toBe(" SKU-1 ");
  });
});
