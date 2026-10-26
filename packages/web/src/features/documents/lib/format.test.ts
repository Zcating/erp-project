import { describe, expect, it } from "vitest";
import { computeLineAmount } from "./format";

describe("单据行金额的定点计算", () => {
  it("单价 1.115、数量 3 按金额精度得 3.35", () => {
    expect(computeLineAmount("3", "1.115")).toBe("3.35");
  });

  it("单价 1.115、数量 4 按金额精度得 4.46", () => {
    expect(computeLineAmount("4", "1.115")).toBe("4.46");
  });

  it("数量与单价按各自精度承载，不产生二进制浮点尾差", () => {
    expect(computeLineAmount("3", "0.1")).toBe("0.30");
    expect(computeLineAmount("1", "0.005")).toBe("0.01");
    expect(computeLineAmount("10", "0.335")).toBe("3.35");
  });

  it("不是合法十进制数时返回 null", () => {
    expect(computeLineAmount("", "1")).toBeNull();
    expect(computeLineAmount("abc", "1")).toBeNull();
    expect(computeLineAmount("1", "1,5")).toBeNull();
  });
});
