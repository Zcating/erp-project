import { pgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { amountType, kernelPg, quantityType, unitPriceType } from "./index.js";

describe("kernel-pg package", () => {
  it("exposes its public surface", () => {
    expect(kernelPg).toEqual({});
  });

  it("把三种精度列映射到迁移产出的 domain", () => {
    const probe = pgTable("precision_probe", {
      quantity: quantityType("quantity"),
      unitPrice: unitPriceType("unit_price"),
      amount: amountType("amount"),
    });

    expect(probe.quantity.getSQLType()).toBe("erp.quantity");
    expect(probe.unitPrice.getSQLType()).toBe("erp.unit_price");
    expect(probe.amount.getSQLType()).toBe("erp.amount");
  });
});
