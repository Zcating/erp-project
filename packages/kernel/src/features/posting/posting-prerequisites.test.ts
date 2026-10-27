import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/errors";
import { DOCUMENT_TYPE_RULES } from "../documents";
import type { Document, DocumentLine, DraftDocumentType } from "../documents";
import { assertPostingPrerequisites, POSTING_PREREQUISITES } from "./prerequisites";

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

const documentOf = (type: DraftDocumentType, overrides: Partial<Document> = {}): Document => ({
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

const readyDocuments: Record<DraftDocumentType, Document> = {
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

describe("过账前置条件表", () => {
  it("六类单据全都要求至少一条单据行，措辞各自带自己的单据名", () => {
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

  it("缺仓库时给出各类型自己的措辞，不复用建单时的仓库名词", () => {
    expect(messageOf({ ...readyDocuments.PURCHASE_INBOUND, targetWarehouseId: null })).toBe(
      "采购入库单缺少目标仓库，不能过账",
    );
    expect(messageOf({ ...readyDocuments.SALE_OUTBOUND, sourceWarehouseId: null })).toBe(
      "销售出库单缺少来源仓库，不能过账",
    );
    expect(messageOf({ ...readyDocuments.SALE_RETURN, sourceWarehouseId: null })).toBe(
      "销售退货单缺少仓库，不能过账",
    );
    expect(messageOf({ ...readyDocuments.PURCHASE_RETURN, sourceWarehouseId: null })).toBe(
      "采购退货单缺少仓库，不能过账",
    );
    expect(messageOf({ ...readyDocuments.STOCKTAKE, warehouseId: null })).toBe(
      "盘点单缺少仓库，不能过账",
    );
    expect(messageOf({ ...readyDocuments.TRANSFER, targetWarehouseId: null })).toBe(
      "调拨单缺少源仓或目标仓，不能过账",
    );
  });

  it("采购入库单要求单价，销售出库单要求售价，其余类型不要求", () => {
    expect(
      messageOf({
        ...readyDocuments.PURCHASE_INBOUND,
        lines: [line({ unitPrice: null })],
      }),
    ).toBe("第 1 行缺少单价，不能过账");
    expect(
      messageOf({
        ...readyDocuments.SALE_OUTBOUND,
        lines: [line({ unitPrice: null })],
      }),
    ).toBe("第 1 行缺少售价，不能过账");
    expect(messageOf({ ...readyDocuments.STOCKTAKE, lines: [line({ unitPrice: null })] })).toBe("");
    expect(messageOf({ ...readyDocuments.TRANSFER, lines: [line({ unitPrice: null })] })).toBe("");
  });

  it("两类退货单要求引用原单据行，其余类型不要求", () => {
    expect(
      messageOf({
        ...readyDocuments.SALE_RETURN,
        lines: [line({ originalLineId: null })],
      }),
    ).toBe("第 1 行缺少原单据行引用，不能过账");
    expect(
      messageOf({
        ...readyDocuments.PURCHASE_RETURN,
        lines: [line({ originalLineId: null })],
      }),
    ).toBe("第 1 行缺少原单据行引用，不能过账");
    expect(messageOf(readyDocuments.SALE_OUTBOUND)).toBe("");
  });

  it("盘点单不要求数量为正，其余类型都要求", () => {
    expect(messageOf({ ...readyDocuments.STOCKTAKE, lines: [line({ quantity: "0" })] })).toBe("");
    expect(
      messageOf({ ...readyDocuments.PURCHASE_INBOUND, lines: [line({ quantity: "0" })] }),
    ).toBe("第 1 行数量必须大于 0：0");
    expect(messageOf({ ...readyDocuments.SALE_OUTBOUND, lines: [line({ quantity: "0" })] })).toBe(
      "第 1 行数量必须大于 0：0",
    );
    expect(messageOf({ ...readyDocuments.TRANSFER, lines: [line({ quantity: "0" })] })).toBe(
      "第 1 行数量必须大于 0：0",
    );
  });

  it("每一类单据声明的仓库角色与该类型在建单时要求的仓库角色一致", () => {
    for (const [type, prerequisite] of Object.entries(POSTING_PREREQUISITES)) {
      expect(prerequisite.warehouses).toEqual(
        DOCUMENT_TYPE_RULES[type as DraftDocumentType].warehouses,
      );
    }
  });

  it("调拨单的建单单价要求不套用到过账：过账表里调拨单没有单价要求", () => {
    expect(DOCUMENT_TYPE_RULES.TRANSFER.priced).toBe(true);
    expect(POSTING_PREREQUISITES.TRANSFER.priceLabel).toBeNull();
  });

  it("盘点单与调拨单在过账表里没有数量要求之外的额外前提", () => {
    expect(POSTING_PREREQUISITES.STOCKTAKE.positiveQuantity).toBe(false);
    expect(POSTING_PREREQUISITES.STOCKTAKE.originalLine).toBe(false);
    expect(POSTING_PREREQUISITES.TRANSFER.positiveQuantity).toBe(true);
    expect(POSTING_PREREQUISITES.TRANSFER.originalLine).toBe(false);
  });
});
