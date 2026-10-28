import { describe, expect, it } from "vitest";
import type { DraftDocumentType } from "../../../server/documents";
import { documentFormSchema, type DocumentFormValues, type DocumentLineDraft } from "./schema";

const baseLine: DocumentLineDraft = {
  itemId: "item-1",
  quantity: "12",
  unitPrice: "2.5",
  unit: "箱",
  originalLineId: "line-1",
};

const baseValues: DocumentFormValues = {
  supplierId: "sup-1",
  customerId: "cus-1",
  sourceWarehouseId: "wh-source",
  targetWarehouseId: "wh-target",
  warehouseId: "wh-count",
  lines: [baseLine],
};

const firstMessage = (
  documentType: DraftDocumentType,
  overrides: Partial<DocumentFormValues> = {},
): string | undefined => {
  const result = documentFormSchema(documentType).safeParse({ ...baseValues, ...overrides });
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe("单据表单规则", () => {
  it("采购入库单缺供应商时给出「缺少供应商」，缺目标仓库时给出「缺少目标仓库」", () => {
    expect(firstMessage("PURCHASE_INBOUND", { supplierId: "" })).toBe("缺少供应商");
    expect(firstMessage("PURCHASE_INBOUND", { targetWarehouseId: "" })).toBe("缺少目标仓库");
  });

  it("销售出库单缺客户时给出「缺少客户」，缺来源仓库时给出「缺少来源仓库」", () => {
    expect(firstMessage("SALE_OUTBOUND", { customerId: "" })).toBe("缺少客户");
    expect(firstMessage("SALE_OUTBOUND", { sourceWarehouseId: "" })).toBe("缺少来源仓库");
  });

  it("盘点单缺仓库时给出「缺少仓库」", () => {
    expect(firstMessage("STOCKTAKE", { warehouseId: "" })).toBe("缺少仓库");
  });

  it("调拨单缺源仓时给出「缺少源仓」，缺目标仓时给出「缺少目标仓」", () => {
    expect(firstMessage("TRANSFER", { sourceWarehouseId: "" })).toBe("缺少源仓");
    expect(firstMessage("TRANSFER", { targetWarehouseId: "" })).toBe("缺少目标仓");
  });

  it("调拨单源仓与目标仓相同时给出「源仓与目标仓必须不同」", () => {
    expect(
      firstMessage("TRANSFER", { sourceWarehouseId: "wh-same", targetWarehouseId: "wh-same" }),
    ).toBe("源仓与目标仓必须不同");
  });

  it("两种退货单缺来源仓库时给出「缺少来源仓库」", () => {
    expect(firstMessage("SALE_RETURN", { sourceWarehouseId: "" })).toBe("缺少来源仓库");
    expect(firstMessage("PURCHASE_RETURN", { sourceWarehouseId: "" })).toBe("缺少来源仓库");
  });

  it("两种退货单的行缺原单据行引用时给出带行号的提示", () => {
    expect(firstMessage("SALE_RETURN", { lines: [{ ...baseLine, originalLineId: "" }] })).toBe(
      "第 1 行缺少原单据行引用",
    );
    expect(
      firstMessage("PURCHASE_RETURN", {
        lines: [
          { ...baseLine, originalLineId: "line-1" },
          { ...baseLine, originalLineId: "" },
        ],
      }),
    ).toBe("第 2 行缺少原单据行引用");
  });

  it("只报第一条错误", () => {
    expect(firstMessage("PURCHASE_INBOUND", { supplierId: "", targetWarehouseId: "" })).toBe(
      "缺少供应商",
    );
  });

  it("数量、商品与单价为空不由客户端规则判定", () => {
    expect(
      firstMessage("PURCHASE_INBOUND", {
        lines: [{ itemId: "", quantity: "", unitPrice: "", unit: "", originalLineId: "" }],
      }),
    ).toBeUndefined();
  });

  it("字段齐备时规则通过", () => {
    expect(firstMessage("PURCHASE_INBOUND")).toBeUndefined();
    expect(firstMessage("SALE_OUTBOUND")).toBeUndefined();
    expect(firstMessage("STOCKTAKE")).toBeUndefined();
    expect(firstMessage("TRANSFER")).toBeUndefined();
    expect(firstMessage("SALE_RETURN")).toBeUndefined();
    expect(firstMessage("PURCHASE_RETURN")).toBeUndefined();
  });
});
