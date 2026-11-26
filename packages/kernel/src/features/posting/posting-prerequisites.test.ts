import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/errors";
import type { Document, DocumentLine, DocumentType } from "../documents";
import { assertPostingPrerequisites } from "./prerequisites";

const line = (overrides: Partial<DocumentLine> = {}): DocumentLine => ({
  id: "line-1",
  lineNo: 1,
  itemId: "item-1",
  quantity: "1.000",
  unitPrice: "1.000",
  amount: null,
  originalLineId: null,
  ...overrides,
});

const documentOf = (type: DocumentType, overrides: Partial<Document> = {}): Document => ({
  id: "doc-1",
  documentNo: "DOC-1",
  type,
  status: "DRAFT",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [line()],
  ...overrides,
});

const readyDocuments: Record<DocumentType, Document> = {
  PURCHASE_INBOUND: documentOf("PURCHASE_INBOUND", { targetWarehouseId: "warehouse-1" }),
  SALE_OUTBOUND: documentOf("SALE_OUTBOUND", { sourceWarehouseId: "warehouse-1" }),
  SALE_RETURN: documentOf("SALE_RETURN", {
    sourceWarehouseId: "warehouse-1",
    lines: [line({ originalLineId: "original-line-1" })],
  }),
  PURCHASE_RETURN: documentOf("PURCHASE_RETURN", {
    sourceWarehouseId: "warehouse-1",
    lines: [line({ originalLineId: "original-line-1" })],
  }),
  STOCKTAKE: documentOf("STOCKTAKE", { warehouseId: "warehouse-1" }),
  TRANSFER: documentOf("TRANSFER", {
    sourceWarehouseId: "warehouse-1",
    targetWarehouseId: "warehouse-2",
  }),
};

const messageOf = (document: Document): string => {
  try {
    assertPostingPrerequisites(document);
  } catch (caught) {
    return (caught as ValidationError).message;
  }
  return "";
};

const missingWarehouseCases: Array<{
  type: DocumentType;
  cleared: Partial<Document>;
  message: string;
}> = [
  {
    type: "PURCHASE_INBOUND",
    cleared: { targetWarehouseId: null },
    message: "采购入库单缺少目标仓库，不能过账",
  },
  {
    type: "SALE_OUTBOUND",
    cleared: { sourceWarehouseId: null },
    message: "销售出库单缺少来源仓库，不能过账",
  },
  {
    type: "SALE_RETURN",
    cleared: { sourceWarehouseId: null },
    message: "销售退货单缺少仓库，不能过账",
  },
  {
    type: "PURCHASE_RETURN",
    cleared: { sourceWarehouseId: null },
    message: "采购退货单缺少仓库，不能过账",
  },
  {
    type: "STOCKTAKE",
    cleared: { warehouseId: null },
    message: "盘点单缺少仓库，不能过账",
  },
  {
    type: "TRANSFER",
    cleared: { targetWarehouseId: null },
    message: "调拨单缺少源仓或目标仓，不能过账",
  },
];

const returnTypes: readonly DocumentType[] = ["SALE_RETURN", "PURCHASE_RETURN"];

const nonReturnTypes: readonly DocumentType[] = [
  "PURCHASE_INBOUND",
  "SALE_OUTBOUND",
  "STOCKTAKE",
  "TRANSFER",
];

describe("过账前置条件", () => {
  it("零行单据报各自类型的「没有单据行」，措辞带自己的单据名", () => {
    const messages = Object.entries(readyDocuments).map(([type, document]) => [
      type,
      messageOf({ ...document, lines: [] }),
    ]);

    expect(messages).toEqual([
      ["PURCHASE_INBOUND", "采购入库单没有单据行，不能过账"],
      ["SALE_OUTBOUND", "销售出库单没有单据行，不能过账"],
      ["SALE_RETURN", "销售退货单没有单据行，不能过账"],
      ["PURCHASE_RETURN", "采购退货单没有单据行，不能过账"],
      ["STOCKTAKE", "盘点单没有单据行，不能过账"],
      ["TRANSFER", "调拨单没有单据行，不能过账"],
    ]);
  });

  it("缺仓库时每类单据各报自己的文案", () => {
    for (const { type, cleared, message } of missingWarehouseCases) {
      expect(messageOf({ ...readyDocuments[type], ...cleared })).toBe(message);
    }
  });

  it("两类退货单缺原单据行时报既有文案", () => {
    for (const type of returnTypes) {
      expect(messageOf({ ...readyDocuments[type], lines: [line({ originalLineId: null })] })).toBe(
        "第 1 行缺少原单据行引用，不能过账",
      );
    }
  });

  it("其余类型缺原单据行时不报错", () => {
    for (const type of nonReturnTypes) {
      expect(messageOf({ ...readyDocuments[type], lines: [line({ originalLineId: null })] })).toBe(
        "",
      );
    }
  });
});
