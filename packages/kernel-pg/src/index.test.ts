import { pgTable } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  amountType,
  conversionRateType,
  customers,
  documentLines,
  documentNumberCounters,
  documents,
  inventoryBalances,
  inventoryLedgerEntries,
  itemAuxiliaryUnits,
  items,
  kernelPg,
  quantityType,
  suppliers,
  transferInTransit,
  unitPriceType,
  warehouses,
} from "./index";

describe("kernel-pg package", () => {
  it("exposes its public surface", () => {
    expect(Object.keys(kernelPg).sort()).toEqual([
      "createCustomerRepository",
      "createDatabase",
      "createDocumentRepository",
      "createItemMasterRepository",
      "createStockLedgerRepository",
      "createSupplierRepository",
      "createTransactionRunner",
      "createTransferInTransitRepository",
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

  it("单据、单据行与单据序号计数器三张表落在 erp schema，单据行的数量、单价、金额用 erp 三个十进制域承载", () => {
    expect(getTableConfig(documents).schema).toBe("erp");
    expect(getTableConfig(documents).name).toBe("documents");
    expect(getTableConfig(documentLines).schema).toBe("erp");
    expect(getTableConfig(documentLines).name).toBe("document_lines");
    expect(getTableConfig(documentNumberCounters).schema).toBe("erp");
    expect(getTableConfig(documentNumberCounters).name).toBe("document_number_counters");

    expect(documentLines.quantity.getSQLType()).toBe("erp.quantity");
    expect(documentLines.unitPrice.getSQLType()).toBe("erp.unit_price");
    expect(documentLines.amount.getSQLType()).toBe("erp.amount");

    const indexNamesOf = (table: ReturnType<typeof getTableConfig>): string[] =>
      table.indexes.map((index) => index.config.name ?? "");

    expect(indexNamesOf(getTableConfig(documents))).toEqual([
      "documents_document_no_key",
      "documents_type_status_idx",
    ]);
    expect(indexNamesOf(getTableConfig(documentLines))).toEqual([
      "document_lines_document_line_no_key",
    ]);
  });

  it("库存台账与库存流水两张表落在 erp schema，数量、单价、金额分别用 erp 三个十进制域承载", () => {
    expect(getTableConfig(inventoryBalances).schema).toBe("erp");
    expect(getTableConfig(inventoryBalances).name).toBe("inventory_balances");
    expect(getTableConfig(inventoryLedgerEntries).schema).toBe("erp");
    expect(getTableConfig(inventoryLedgerEntries).name).toBe("inventory_ledger_entries");

    expect(inventoryBalances.quantity.getSQLType()).toBe("erp.quantity");
    expect(inventoryBalances.unitCost.getSQLType()).toBe("erp.unit_price");
    expect(inventoryLedgerEntries.quantityBefore.getSQLType()).toBe("erp.quantity");
    expect(inventoryLedgerEntries.quantityAfter.getSQLType()).toBe("erp.quantity");
    expect(inventoryLedgerEntries.costBefore.getSQLType()).toBe("erp.unit_price");
    expect(inventoryLedgerEntries.costAfter.getSQLType()).toBe("erp.unit_price");
    expect(inventoryLedgerEntries.unitPrice.getSQLType()).toBe("erp.unit_price");
    expect(inventoryLedgerEntries.amount.getSQLType()).toBe("erp.amount");

    const indexNamesOf = (table: ReturnType<typeof getTableConfig>): string[] =>
      table.indexes.map((index) => index.config.name ?? "");

    expect(indexNamesOf(getTableConfig(inventoryLedgerEntries))).toEqual([
      "inventory_ledger_entries_document_idx",
      "inventory_ledger_entries_document_no_idx",
    ]);
  });

  it("在途表落在 erp schema，数量与在途成本分别用 erp.quantity 与 erp.unit_price 承载", () => {
    expect(getTableConfig(transferInTransit).schema).toBe("erp");
    expect(getTableConfig(transferInTransit).name).toBe("transfer_in_transit");
    expect(transferInTransit.quantity.getSQLType()).toBe("erp.quantity");
    expect(transferInTransit.unitCost.getSQLType()).toBe("erp.unit_price");

    const indexNamesOf = (table: ReturnType<typeof getTableConfig>): string[] =>
      table.indexes.map((index) => index.config.name ?? "");

    expect(indexNamesOf(getTableConfig(transferInTransit))).toEqual([
      "transfer_in_transit_document_line_key",
      "transfer_in_transit_source_item_idx",
    ]);
  });
});
