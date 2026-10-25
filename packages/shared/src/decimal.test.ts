import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amount,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
  type Amount,
  type Quantity,
  type UnitPrice,
} from "./index.js";

describe("十进制能力", () => {
  it("数量 1.0005 按四舍五入承载为 1.001，不截断", () => {
    expect(toFixedString(quantity("1.0005"), QUANTITY_SCALE)).toBe("1.001");
  });

  it("单价 1.2345678 按四舍五入承载为 1.234568，不截断", () => {
    expect(toFixedString(unitPrice("1.2345678"), UNIT_PRICE_SCALE)).toBe("1.234568");
  });

  it("金额 1.005 按四舍五入承载为 1.01，不截断", () => {
    expect(toFixedString(amount("1.005"), AMOUNT_SCALE)).toBe("1.01");
  });

  it("金额 0.125 按 2 位小数舍入为 0.13，不是银行家舍入的 0.12", () => {
    expect(toFixedString(amount("0.125"), AMOUNT_SCALE)).toBe("0.13");
  });

  it("金额 = 数量 × 单价：3 × 1.115 得 3.35，不是二进制浮点的 3.34", () => {
    const amountValue = amountOf(quantity("3"), unitPrice("1.115"));
    expect(amountValue.toString()).toBe("3.35");
    expect(toFixedString(amountValue, AMOUNT_SCALE)).toBe("3.35");
  });

  it("入库金额与普通金额同一套舍入规则：12 × 进价 1.115 得 13.38", () => {
    expect(toFixedString(amountOf(quantity("12"), unitPrice("1.115")), AMOUNT_SCALE)).toBe("13.38");
  });

  it("数量 × 单价按规格声明的列宽精确承载：999999999999999.999 × 5.000001 得 5000000999999999.99", () => {
    const amountValue = amountOf(quantity("999999999999999.999"), unitPrice("5.000001"));
    expect(amountValue.toString()).toBe("5000000999999999.99");
    expect(toFixedString(amountValue, AMOUNT_SCALE)).toBe("5000000999999999.99");
  });

  it("对外导出的数量/单价/金额是十进制类型，number 不能被赋给金额字段", () => {
    expect(typeof quantity("1")).not.toBe("number");
    expect(typeof unitPrice("1")).not.toBe("number");
    expect(typeof amount("1.005")).not.toBe("number");
    expectTypeOf<number>().not.toExtend<Quantity>();
    expectTypeOf<number>().not.toExtend<UnitPrice>();
    expectTypeOf<number>().not.toExtend<Amount>();
    expectTypeOf<Quantity>().not.toExtend<number>();
    expectTypeOf<UnitPrice>().not.toExtend<number>();
    expectTypeOf<Amount>().not.toExtend<number>();
    const amountField = (value: Amount): Amount => value;
    // @ts-expect-error number 不能被赋给金额字段
    amountField(1);
  });
});
