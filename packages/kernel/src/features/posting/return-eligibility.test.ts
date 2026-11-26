import { amount, quantity, toFixedString } from "@erp-project/shared";
import type { Amount, Quantity } from "@erp-project/shared";
import { describe, expect, it } from "vitest";
import {
  RETURN_QUANTITY_ROUNDING,
  assertReturnWithinLimit,
  remainingReturnableQuantity,
  returnedCostAllocation,
} from "./return-eligibility";
import type { OriginalCostBasis, OriginalLineBasis } from "./return-eligibility";

const basisOf = (quantityText: string, documentNo = "SO-1", lineNo = 2): OriginalLineBasis => ({
  documentNo,
  lineNo,
  quantity: quantity(quantityText),
});

const costBasisOf = (
  quantityText: string,
  costText: string,
  documentNo = "SO-1",
  lineNo = 2,
): OriginalCostBasis => ({
  ...basisOf(quantityText, documentNo, lineNo),
  cost: amount(costText),
});

const preciseQuantity = (numerator: string, denominator: string): Quantity =>
  quantity(numerator).dividedBy(quantity(denominator)) as unknown as Quantity;

const messageOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("没有抛出错误");
};

describe("可退余量", () => {
  const cases: Array<{ original: string; returned: string; remaining: string }> = [
    { original: "5.000", returned: "0.000", remaining: "5.000" },
    { original: "5.000", returned: "3.000", remaining: "2.000" },
    { original: "5.000", returned: "5.000", remaining: "0.000" },
    { original: "12.500", returned: "2.375", remaining: "10.125" },
  ];

  it.each(cases)("原行 $original 已退 $returned 时可退 $remaining", (row) => {
    const remaining = remainingReturnableQuantity(basisOf(row.original), {
      quantity: quantity(row.returned),
      amount: amount("0"),
    });
    expect(toFixedString(remaining, 3)).toBe(row.remaining);
  });
});

describe("应回冲金额", () => {
  const cases: Array<{
    name: string;
    original: string;
    cost: string;
    previous: string;
    cumulative: string;
    returned: string;
    expectedAllocated: string;
    expectedCumulative: string;
    expectedUnitPrice: string;
  }> = [
    {
      name: "按累计数量占比分摊，原出库 5 瓶、成本 10.00，退 2 瓶",
      original: "5.000",
      cost: "10.00",
      previous: "0.00",
      cumulative: "2.000",
      returned: "2.000",
      expectedAllocated: "4.00",
      expectedCumulative: "4.00",
      expectedUnitPrice: "2.000000",
    },
    {
      name: "尾差收敛第一次：原出库 3 瓶、成本 10.00，第一次退 1 瓶",
      original: "3.000",
      cost: "10.00",
      previous: "0.00",
      cumulative: "1.000",
      returned: "1.000",
      expectedAllocated: "3.33",
      expectedCumulative: "3.33",
      expectedUnitPrice: "3.330000",
    },
    {
      name: "尾差收敛第二次：累计 2 瓶、已分摊 3.33",
      original: "3.000",
      cost: "10.00",
      previous: "3.33",
      cumulative: "2.000",
      returned: "1.000",
      expectedAllocated: "3.34",
      expectedCumulative: "6.67",
      expectedUnitPrice: "3.340000",
    },
    {
      name: "尾差收敛第三次：累计 3 瓶、已分摊 6.67，合计正好 10.00",
      original: "3.000",
      cost: "10.00",
      previous: "6.67",
      cumulative: "3.000",
      returned: "1.000",
      expectedAllocated: "3.33",
      expectedCumulative: "10.00",
      expectedUnitPrice: "3.330000",
    },
  ];

  it.each(cases)("$name", (row) => {
    const allocation = returnedCostAllocation(
      costBasisOf(row.original, row.cost),
      amount(row.previous),
      quantity(row.cumulative),
      quantity(row.returned),
    );
    expect(toFixedString(allocation.allocatedAmount, 2)).toBe(row.expectedAllocated);
    expect(toFixedString(allocation.cumulativeAmount, 2)).toBe(row.expectedCumulative);
    expect(allocation.unitPrice).toBe(row.expectedUnitPrice);
  });

  it("尾差收敛后三次分摊合计等于原结转成本", () => {
    const basis = costBasisOf("3.000", "10.00");
    let previous: Amount = amount("0");
    let total: Amount = amount("0");
    for (const cumulative of ["1.000", "2.000", "3.000"]) {
      const allocation = returnedCostAllocation(
        basis,
        previous,
        quantity(cumulative),
        quantity("1.000"),
      );
      previous = allocation.cumulativeAmount;
      total = amount(toFixedString(total.plus(allocation.allocatedAmount), 2));
    }
    expect(toFixedString(total, 2)).toBe("10.00");
  });
});

describe("两套累计口径", () => {
  const previous = preciseQuantity("49995", "10000");
  const returned = preciseQuantity("6", "10000");

  it("先舍入后比较：5.0001 舍入为 5.000，不超退", () => {
    const cumulative = assertReturnWithinLimit(
      basisOf("5.000"),
      previous,
      returned,
      "销售退货单",
      "SRT-1",
      1,
      RETURN_QUANTITY_ROUNDING.BEFORE_COMPARE,
    );
    expect(toFixedString(cumulative, 3)).toBe("5.000");
  });

  it("未舍入比较、写入时舍入：5.0001 超过 5.000，报超退", () => {
    const message = messageOf(() =>
      assertReturnWithinLimit(
        basisOf("5.000"),
        previous,
        returned,
        "采购退货单",
        "PRT-1",
        1,
        RETURN_QUANTITY_ROUNDING.ON_WRITE,
      ),
    );
    expect(message).toBe(
      "采购退货单 PRT-1 第 1 行超退 0.000：累计退货 5.000 超过原单据 SO-1 第 2 行已过账数量 5.000",
    );
  });
});

describe("超退文案逐字", () => {
  const cases: Array<{
    label: string;
    documentNo: string;
    lineNo: number;
    originalDocumentNo: string;
    originalLineNo: number;
    expected: string;
  }> = [
    {
      label: "销售退货单",
      documentNo: "SRT-1",
      lineNo: 1,
      originalDocumentNo: "SO-1",
      originalLineNo: 2,
      expected:
        "销售退货单 SRT-1 第 1 行超退 1.000：累计退货 6.000 超过原单据 SO-1 第 2 行已过账数量 5.000",
    },
    {
      label: "采购退货单",
      documentNo: "PRT-1",
      lineNo: 3,
      originalDocumentNo: "PI-1",
      originalLineNo: 4,
      expected:
        "采购退货单 PRT-1 第 3 行超退 1.000：累计退货 6.000 超过原单据 PI-1 第 4 行已过账数量 5.000",
    },
  ];

  it.each(cases)("$label 的超退文案", (row) => {
    const message = messageOf(() =>
      assertReturnWithinLimit(
        basisOf("5.000", row.originalDocumentNo, row.originalLineNo),
        quantity("4.000"),
        quantity("2.000"),
        row.label,
        row.documentNo,
        row.lineNo,
        RETURN_QUANTITY_ROUNDING.BEFORE_COMPARE,
      ),
    );
    expect(message).toBe(row.expected);
  });
});
