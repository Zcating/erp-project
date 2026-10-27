import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/errors";
import type { Document } from "./model";
import { resolveOriginalLine } from "./returns";

const documentOf = (overrides: Partial<Document> = {}): Document => ({
  id: "original-1",
  documentNo: "SOUT-20260102-001",
  type: "SALE_OUTBOUND",
  status: "POSTED",
  supplierId: null,
  customerId: "customer-1",
  sourceWarehouseId: "warehouse-1",
  targetWarehouseId: null,
  warehouseId: null,
  lines: [
    {
      id: "original-line-1",
      lineNo: 1,
      itemId: "item-1",
      quantity: "5.000",
      unitPrice: "3.5",
      amount: null,
      originalLineId: null,
    },
  ],
  ...overrides,
});

const CREATION_WORDING = {
  prefix: "第 1 行引用的原单据行",
  wrongType: "不属于销售出库单",
};

const POSTING_WORDING = {
  prefix: "引用的原单据行",
  wrongType: "不是销售出库单的行",
};

const messageOf = (original: Document | null): string => {
  try {
    resolveOriginalLine(original, "original-line-1", "SALE_OUTBOUND", POSTING_WORDING);
  } catch (caught) {
    return (caught as ValidationError).message;
  }
  return "";
};

describe("退货行引用原单据行的共用校验", () => {
  it("建单路径与过账路径各自保留自己的措辞", () => {
    const draft = documentOf({ status: "DRAFT" });

    expect(() =>
      resolveOriginalLine(draft, "original-line-1", "SALE_OUTBOUND", CREATION_WORDING),
    ).toThrow("第 1 行引用的原单据行尚未过账：SOUT-20260102-001");
    expect(() =>
      resolveOriginalLine(draft, "original-line-1", "SALE_OUTBOUND", POSTING_WORDING),
    ).toThrow("引用的原单据行尚未过账：SOUT-20260102-001");
  });

  it("原单据行不存在时两套措辞都指出行号引用", () => {
    expect(() =>
      resolveOriginalLine(null, "missing-line-id", "SALE_OUTBOUND", CREATION_WORDING),
    ).toThrow("第 1 行引用的原单据行不存在：missing-line-id");
    expect(() =>
      resolveOriginalLine(null, "missing-line-id", "SALE_OUTBOUND", POSTING_WORDING),
    ).toThrow("引用的原单据行不存在：missing-line-id");
  });

  it("原单据类型不符时两套措辞都指出类型", () => {
    const purchaseInbound = documentOf({ type: "PURCHASE_INBOUND" });

    expect(() =>
      resolveOriginalLine(purchaseInbound, "original-line-1", "SALE_OUTBOUND", CREATION_WORDING),
    ).toThrow("第 1 行引用的原单据行不属于销售出库单：SOUT-20260102-001");
    expect(() =>
      resolveOriginalLine(purchaseInbound, "original-line-1", "SALE_OUTBOUND", POSTING_WORDING),
    ).toThrow("引用的原单据行不是销售出库单的行：SOUT-20260102-001");
  });

  it("原单据已过账且行存在时校验通过并返回原单据行", () => {
    const original = documentOf();

    const resolved = resolveOriginalLine(
      original,
      "original-line-1",
      "SALE_OUTBOUND",
      POSTING_WORDING,
    );

    expect(resolved.original).toBe(original);
    expect(resolved.line.id).toBe("original-line-1");
    expect(messageOf(original)).toBe("");
  });
});
