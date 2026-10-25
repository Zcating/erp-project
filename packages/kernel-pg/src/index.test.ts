import { pgTable } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  amountType,
  conversionRateType,
  customers,
  itemAuxiliaryUnits,
  items,
  kernelPg,
  quantityType,
  suppliers,
  unitPriceType,
  warehouses,
} from "./index.js";

describe("kernel-pg package", () => {
  it("exposes its public surface", () => {
    expect(Object.keys(kernelPg).sort()).toEqual([
      "createCustomerRepository",
      "createDatabase",
      "createItemMasterRepository",
      "createSupplierRepository",
      "createWarehouseRepository",
    ]);
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

  it("供应商、客户与仓库三张表落在 erp schema，各自带编码唯一索引", () => {
    expect(getTableConfig(suppliers).schema).toBe("erp");
    expect(getTableConfig(suppliers).name).toBe("suppliers");
    expect(getTableConfig(customers).schema).toBe("erp");
    expect(getTableConfig(customers).name).toBe("customers");
    expect(getTableConfig(warehouses).schema).toBe("erp");
    expect(getTableConfig(warehouses).name).toBe("warehouses");

    const indexNamesOf = (table: ReturnType<typeof getTableConfig>): string[] =>
      table.indexes.map((index) => index.config.name ?? "");

    expect(indexNamesOf(getTableConfig(suppliers))).toEqual(["suppliers_code_key"]);
    expect(indexNamesOf(getTableConfig(customers))).toEqual(["customers_code_key"]);
    expect(indexNamesOf(getTableConfig(warehouses))).toEqual(["warehouses_code_key"]);
  });
});
