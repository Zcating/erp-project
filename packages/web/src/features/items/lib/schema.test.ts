import { describe, expect, it } from "vitest";
import { itemFormSchema } from "./schema";

const validValues = {
  code: "SKU-1",
  barcode: "6900000000001",
  name: "可口可乐",
  specification: "500ml/瓶",
  brand: "可口可乐",
  category: "饮料",
  baseUnit: "瓶",
  auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
};

const firstMessage = (values: unknown): string | undefined => {
  const result = itemFormSchema.safeParse(values);
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe("商品档案表单规则", () => {
  it("缺少商品名称时给出「缺少商品名称」", () => {
    expect(firstMessage({ ...validValues, name: "" })).toBe("缺少商品名称");
    expect(firstMessage({ ...validValues, name: "  " })).toBe("缺少商品名称");
  });

  it("缺少基本计量单位时给出「缺少基本计量单位」", () => {
    expect(firstMessage({ ...validValues, baseUnit: "" })).toBe("缺少基本计量单位");
  });

  it("名称与基本计量单位都缺失时只报第一条错误", () => {
    expect(firstMessage({ ...validValues, name: "", baseUnit: "" })).toBe("缺少商品名称");
  });

  it("规则里没有商品编码与商品条码的判定，编码为空也能通过", () => {
    expect(firstMessage({ ...validValues, code: "" })).toBeUndefined();
    expect(firstMessage({ ...validValues, barcode: "" })).toBeUndefined();
  });

  it("换算率在规则里保持字符串，不做数值判定", () => {
    expect(
      firstMessage({
        ...validValues,
        auxiliaryUnits: [{ unit: "箱", conversionRate: "1.1234567" }],
      }),
    ).toBeUndefined();
  });

  it("辅助计量单位缺少单位名与换算率不在规则里判定", () => {
    expect(
      firstMessage({ ...validValues, auxiliaryUnits: [{ unit: "", conversionRate: "" }] }),
    ).toBeUndefined();
  });

  it("字段齐备时规则通过", () => {
    expect(firstMessage(validValues)).toBeUndefined();
  });
});
