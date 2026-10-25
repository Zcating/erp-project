import { pgTable } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  amountType,
  conversionRateType,
  itemAuxiliaryUnits,
  items,
  kernelPg,
  quantityType,
  unitPriceType,
} from "./index.js";

describe("kernel-pg package", () => {
  it("exposes its public surface", () => {
    expect(Object.keys(kernelPg).sort()).toEqual(["createDatabase", "createItemMasterRepository"]);
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

  it("商品档案与辅助计量单位落在 erp schema，换算率列用 erp.conversion_rate 承载", () => {
    expect(getTableConfig(items).schema).toBe("erp");
    expect(getTableConfig(items).name).toBe("items");
    expect(getTableConfig(itemAuxiliaryUnits).schema).toBe("erp");
    expect(getTableConfig(itemAuxiliaryUnits).name).toBe("item_auxiliary_units");
    expect(itemAuxiliaryUnits.conversionRate.getSQLType()).toBe("erp.conversion_rate");

    const probe = pgTable("conversion_rate_probe", {
      conversionRate: conversionRateType("conversion_rate"),
    });
    expect(probe.conversionRate.getSQLType()).toBe("erp.conversion_rate");
  });
});
