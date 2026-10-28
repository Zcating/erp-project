import { describe, expect, it } from "vitest";
import type { DraftDocumentType } from "../../../server/documents";
import {
  DOCUMENT_FORM_RULES,
  missingPartyMessage,
  missingWarehouseMessage,
  requiresDistinctWarehouses,
} from "./rules";

const draftTypes: readonly DraftDocumentType[] = [
  "PURCHASE_INBOUND",
  "SALE_OUTBOUND",
  "SALE_RETURN",
  "PURCHASE_RETURN",
  "STOCKTAKE",
  "TRANSFER",
];

describe("单据类型规则映射表", () => {
  it("覆盖六种草稿单据类型", () => {
    expect(Object.keys(DOCUMENT_FORM_RULES).sort()).toEqual([...draftTypes].sort());
  });

  it("采购入库单要供应商与目标仓库，计价，不引用原单据行", () => {
    const rule = DOCUMENT_FORM_RULES.PURCHASE_INBOUND;

    expect(rule.party).toBe("SUPPLIER");
    expect(rule.warehouses).toEqual(["TARGET"]);
    expect(rule.priced).toBe(true);
    expect(rule.requiresOriginalLine).toBe(false);
    expect(rule.originalType).toBeNull();
    expect(rule.originalWarehouseRole).toBeNull();
  });

  it("销售出库单要客户与来源仓库，计价，不引用原单据行", () => {
    const rule = DOCUMENT_FORM_RULES.SALE_OUTBOUND;

    expect(rule.party).toBe("CUSTOMER");
    expect(rule.warehouses).toEqual(["SOURCE"]);
    expect(rule.priced).toBe(true);
    expect(rule.requiresOriginalLine).toBe(false);
    expect(rule.originalType).toBeNull();
    expect(rule.originalWarehouseRole).toBeNull();
  });

  it("销售退货单要来源仓库，不计价，每行都要引用原单据行", () => {
    const rule = DOCUMENT_FORM_RULES.SALE_RETURN;

    expect(rule.party).toBeNull();
    expect(rule.warehouses).toEqual(["SOURCE"]);
    expect(rule.priced).toBe(false);
    expect(rule.requiresOriginalLine).toBe(true);
    expect(rule.originalType).toBe("SALE_OUTBOUND");
    expect(rule.originalWarehouseRole).toBe("SOURCE");
  });

  it("采购退货单要来源仓库，不计价，每行都要引用原单据行", () => {
    const rule = DOCUMENT_FORM_RULES.PURCHASE_RETURN;

    expect(rule.party).toBeNull();
    expect(rule.warehouses).toEqual(["SOURCE"]);
    expect(rule.priced).toBe(false);
    expect(rule.requiresOriginalLine).toBe(true);
    expect(rule.originalType).toBe("PURCHASE_INBOUND");
    expect(rule.originalWarehouseRole).toBe("TARGET");
  });

  it("盘点单要盘点仓库，不计价，不引用原单据行", () => {
    const rule = DOCUMENT_FORM_RULES.STOCKTAKE;

    expect(rule.party).toBeNull();
    expect(rule.warehouses).toEqual(["COUNT"]);
    expect(rule.priced).toBe(false);
    expect(rule.requiresOriginalLine).toBe(false);
    expect(rule.originalType).toBeNull();
    expect(rule.originalWarehouseRole).toBeNull();
  });

  it("调拨单要来源仓库与目标仓库，计价，不引用原单据行", () => {
    const rule = DOCUMENT_FORM_RULES.TRANSFER;

    expect(rule.party).toBeNull();
    expect(rule.warehouses).toEqual(["SOURCE", "TARGET"]);
    expect(rule.priced).toBe(true);
    expect(rule.requiresOriginalLine).toBe(false);
    expect(rule.originalType).toBeNull();
    expect(rule.originalWarehouseRole).toBeNull();
  });

  it("只有调拨单的源仓与目标仓必须不同", () => {
    for (const type of draftTypes) {
      expect(requiresDistinctWarehouses(DOCUMENT_FORM_RULES[type])).toBe(type === "TRANSFER");
    }
  });

  it("缺参与缺仓库的文案与服务端逐字相同", () => {
    expect(missingPartyMessage("SUPPLIER")).toBe("缺少供应商");
    expect(missingPartyMessage("CUSTOMER")).toBe("缺少客户");

    expect(missingWarehouseMessage(DOCUMENT_FORM_RULES.PURCHASE_INBOUND, "TARGET")).toBe(
      "缺少目标仓库",
    );
    expect(missingWarehouseMessage(DOCUMENT_FORM_RULES.SALE_OUTBOUND, "SOURCE")).toBe(
      "缺少来源仓库",
    );
    expect(missingWarehouseMessage(DOCUMENT_FORM_RULES.SALE_RETURN, "SOURCE")).toBe("缺少来源仓库");
    expect(missingWarehouseMessage(DOCUMENT_FORM_RULES.PURCHASE_RETURN, "SOURCE")).toBe(
      "缺少来源仓库",
    );
    expect(missingWarehouseMessage(DOCUMENT_FORM_RULES.STOCKTAKE, "COUNT")).toBe("缺少仓库");
    expect(missingWarehouseMessage(DOCUMENT_FORM_RULES.TRANSFER, "SOURCE")).toBe("缺少源仓");
    expect(missingWarehouseMessage(DOCUMENT_FORM_RULES.TRANSFER, "TARGET")).toBe("缺少目标仓");
  });
});
