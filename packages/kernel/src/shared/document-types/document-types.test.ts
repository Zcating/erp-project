import { describe, expect, it } from "vitest";
import {
  DOCUMENT_TYPE_CATALOG,
  RETURN_DOCUMENT_TYPES,
  WAREHOUSE_ROLE_LABELS,
  isDocumentType,
} from "./index";
import type { DocumentType, DocumentTypeDescription } from "./index";

const EXPECTED_CATALOG: Record<DocumentType, DocumentTypeDescription> = {
  PURCHASE_INBOUND: {
    label: "采购入库单",
    numberPrefix: "PIN",
    party: "SUPPLIER",
    warehouses: ["TARGET"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
    missingWarehouseMessage: "采购入库单缺少目标仓库，不能过账",
  },
  SALE_OUTBOUND: {
    label: "销售出库单",
    numberPrefix: "SOUT",
    party: "CUSTOMER",
    warehouses: ["SOURCE"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
    missingWarehouseMessage: "销售出库单缺少来源仓库，不能过账",
  },
  SALE_RETURN: {
    label: "销售退货单",
    numberPrefix: "SRET",
    party: null,
    warehouses: ["SOURCE"],
    priced: false,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: "SALE_OUTBOUND",
    originalWarehouseRole: "SOURCE",
    missingWarehouseMessage: "销售退货单缺少仓库，不能过账",
  },
  PURCHASE_RETURN: {
    label: "采购退货单",
    numberPrefix: "PRET",
    party: null,
    warehouses: ["SOURCE"],
    priced: false,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: "PURCHASE_INBOUND",
    originalWarehouseRole: "TARGET",
    missingWarehouseMessage: "采购退货单缺少仓库，不能过账",
  },
  STOCKTAKE: {
    label: "盘点单",
    numberPrefix: "STK",
    party: null,
    warehouses: ["COUNT"],
    priced: false,
    positiveQuantity: false,
    uniqueItems: true,
    originalType: null,
    originalWarehouseRole: null,
    missingWarehouseMessage: "盘点单缺少仓库，不能过账",
  },
  TRANSFER: {
    label: "调拨单",
    numberPrefix: "TRF",
    party: null,
    warehouses: ["SOURCE", "TARGET"],
    priced: true,
    positiveQuantity: true,
    uniqueItems: false,
    originalType: null,
    originalWarehouseRole: null,
    missingWarehouseMessage: "调拨单缺少源仓或目标仓，不能过账",
  },
};

describe("单据类型目录", () => {
  it("目录覆盖且只覆盖六种单据类型", () => {
    expect(Object.keys(DOCUMENT_TYPE_CATALOG).sort()).toEqual([
      "PURCHASE_INBOUND",
      "PURCHASE_RETURN",
      "SALE_OUTBOUND",
      "SALE_RETURN",
      "STOCKTAKE",
      "TRANSFER",
    ]);
  });

  it.each([
    "PURCHASE_INBOUND",
    "SALE_OUTBOUND",
    "SALE_RETURN",
    "PURCHASE_RETURN",
    "STOCKTAKE",
    "TRANSFER",
  ] as const)("单据类型 %s 的目录描述逐字段符合预期", (type) => {
    expect(DOCUMENT_TYPE_CATALOG[type]).toEqual(EXPECTED_CATALOG[type]);
  });

  it("类型守卫只认目录里的六种类型", () => {
    for (const type of Object.keys(EXPECTED_CATALOG)) {
      expect(isDocumentType(type)).toBe(true);
    }
    expect(isDocumentType("SIDEWAYS")).toBe(false);
  });

  it("仓库角色标签沿用既有措辞", () => {
    expect(WAREHOUSE_ROLE_LABELS).toEqual({
      SOURCE: "来源仓",
      TARGET: "目标仓",
      COUNT: "仓库",
    });
  });

  it("由目录派生的退货类型恰好是销售退货与采购退货", () => {
    expect([...RETURN_DOCUMENT_TYPES].sort()).toEqual(["PURCHASE_RETURN", "SALE_RETURN"]);
  });
});
