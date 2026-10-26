import { describe, expect, it } from "vitest";
import type { DraftDocumentType } from "./api";
import { buildDocumentInput, type DocumentFormValues } from "./payload";

const values: DocumentFormValues = {
  supplierId: "sup-1",
  customerId: "cus-1",
  sourceWarehouseId: "wh-source",
  targetWarehouseId: "wh-target",
  warehouseId: "wh-stock",
  lines: [
    {
      itemId: "item-1",
      quantity: "12",
      unitPrice: "2.5",
      unit: "箱",
      originalLineId: "line-1",
    },
  ],
};

const build = (
  documentType: DraftDocumentType,
  overrides: Partial<DocumentFormValues> = {},
): ReturnType<typeof buildDocumentInput> =>
  buildDocumentInput({ ...values, ...overrides }, documentType);

describe("单据表单值到提交载荷的转换", () => {
  it("采购入库单带供应商与目标仓库，不带客户、来源仓库与盘点仓库", () => {
    const input = build("PURCHASE_INBOUND");

    expect(input.type).toBe("PURCHASE_INBOUND");
    expect(input.supplierId).toBe("sup-1");
    expect(input.customerId).toBeNull();
    expect(input.sourceWarehouseId).toBeNull();
    expect(input.targetWarehouseId).toBe("wh-target");
    expect(input.warehouseId).toBeNull();
  });

  it("销售出库单带客户与来源仓库，不带供应商、目标仓库与盘点仓库", () => {
    const input = build("SALE_OUTBOUND");

    expect(input.supplierId).toBeNull();
    expect(input.customerId).toBe("cus-1");
    expect(input.sourceWarehouseId).toBe("wh-source");
    expect(input.targetWarehouseId).toBeNull();
    expect(input.warehouseId).toBeNull();
  });

  it("盘点单带盘点仓库，其余顶层字段不带", () => {
    const input = build("STOCKTAKE");

    expect(input.supplierId).toBeNull();
    expect(input.customerId).toBeNull();
    expect(input.sourceWarehouseId).toBeNull();
    expect(input.targetWarehouseId).toBeNull();
    expect(input.warehouseId).toBe("wh-stock");
  });

  it("调拨单带来源仓库与目标仓库", () => {
    const input = build("TRANSFER");

    expect(input.supplierId).toBeNull();
    expect(input.customerId).toBeNull();
    expect(input.sourceWarehouseId).toBe("wh-source");
    expect(input.targetWarehouseId).toBe("wh-target");
    expect(input.warehouseId).toBeNull();
  });

  it("销售退货单带来源仓库，不带供应商、客户、目标仓库与盘点仓库", () => {
    const input = build("SALE_RETURN");

    expect(input.supplierId).toBeNull();
    expect(input.customerId).toBeNull();
    expect(input.sourceWarehouseId).toBe("wh-source");
    expect(input.targetWarehouseId).toBeNull();
    expect(input.warehouseId).toBeNull();
  });

  it("采购退货单带来源仓库，不带供应商、客户、目标仓库与盘点仓库", () => {
    const input = build("PURCHASE_RETURN");

    expect(input.supplierId).toBeNull();
    expect(input.customerId).toBeNull();
    expect(input.sourceWarehouseId).toBe("wh-source");
    expect(input.targetWarehouseId).toBeNull();
    expect(input.warehouseId).toBeNull();
  });

  it("取值为空时对应字段提交 null", () => {
    const input = build("PURCHASE_INBOUND", {
      supplierId: "",
      targetWarehouseId: "",
      lines: [{ itemId: "item-1", quantity: "12", unitPrice: "2.5", unit: "", originalLineId: "" }],
    });

    expect(input.supplierId).toBeNull();
    expect(input.targetWarehouseId).toBeNull();
    expect(input.lines[0]?.unit).toBeNull();
    expect(input.lines[0]?.originalLineId).toBeNull();
  });

  it("有价单据类型提交单价与单位，金额恒为 null", () => {
    const input = build("PURCHASE_INBOUND");

    expect(input.lines[0]).toEqual({
      itemId: "item-1",
      quantity: "12",
      unitPrice: "2.5",
      amount: null,
      unit: "箱",
      originalLineId: "line-1",
    });
  });

  it("盘点单与两种退货单的行不提交单价", () => {
    expect(build("STOCKTAKE").lines[0]?.unitPrice).toBeNull();
    expect(build("SALE_RETURN").lines[0]?.unitPrice).toBeNull();
    expect(build("PURCHASE_RETURN").lines[0]?.unitPrice).toBeNull();
  });
});
