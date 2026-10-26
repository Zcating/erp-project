import { describe, expect, it } from "vitest";
import {
  inventory,
  itemMaster,
  parties,
  ports,
  posting,
  purchaseReturn,
  purchasing,
  salesReturn,
  selling,
  stocktake,
} from "./index.js";

describe("kernel package", () => {
  it("exposes its public surface", () => {
    expect(ports).toEqual({});
  });

  it("商品档案 feature 的公开面带领域规则与仓储端口实现", () => {
    expect(Object.keys(itemMaster).sort()).toEqual([
      "CONVERSION_RATE_SCALE",
      "ITEM_IMPORT_COLUMNS",
      "ITEM_IMPORT_JSON_FIELDS",
      "baseQuantityOf",
      "createInMemoryItemMasterRepository",
      "createItemImportService",
      "createItemMasterService",
      "formatConversionRate",
      "itemBatchErrorFromDetails",
      "parseCsv",
      "parseItemImportCsv",
      "parseItemImportJson",
      "validateConversionRate",
      "validateItemMasterInput",
    ]);
    expect(itemMaster.CONVERSION_RATE_SCALE).toBe(6);
    expect(itemMaster.ITEM_IMPORT_COLUMNS).toEqual([
      "code",
      "barcode",
      "name",
      "spec",
      "brand",
      "category",
      "baseUnit",
      "auxUnit1",
      "auxUnit1Rate",
      "auxUnit2",
      "auxUnit2Rate",
    ]);
    expect(itemMaster.ITEM_IMPORT_JSON_FIELDS).toEqual(itemMaster.ITEM_IMPORT_COLUMNS);
  });

  it("参与方 feature 的公开面带领域规则、仓储端口实现与服务工厂", () => {
    expect(Object.keys(parties).sort()).toEqual([
      "createCustomerService",
      "createInMemoryCustomerRepository",
      "createInMemorySupplierRepository",
      "createInMemoryWarehouseRepository",
      "createSupplierService",
      "createWarehouseService",
      "validateCustomerInput",
      "validateSupplierInput",
      "validateWarehouseInput",
    ]);
  });

  it("库存 feature 的公开面带库存台账与库存流水的端口实现、成本结转与查询服务", () => {
    expect(Object.keys(inventory).sort()).toEqual([
      "STOCK_LEDGER_DIRECTIONS",
      "createInMemoryStockLedgerRepository",
      "createInventoryQueryService",
      "weightedAverageUnitCost",
    ]);
  });

  it("过账 feature 的公开面带过账服务与扩展点类型", () => {
    expect(Object.keys(posting).sort()).toEqual(["POSTING_DIRECTIONS", "createPostingService"]);
  });

  it("采购 feature 的公开面带采购入库的过账类型实现", () => {
    expect(Object.keys(purchasing).sort()).toEqual(["createPurchaseInboundPostingHandler"]);
  });

  it("销售 feature 的公开面带销售出库的过账类型实现", () => {
    expect(Object.keys(selling).sort()).toEqual(["createSaleOutboundPostingHandler"]);
  });

  it("销售退货 feature 的公开面带销售退货的过账类型实现", () => {
    expect(Object.keys(salesReturn).sort()).toEqual(["createSaleReturnPostingHandler"]);
  });

  it("采购退货 feature 的公开面带采购退货的过账类型实现", () => {
    expect(Object.keys(purchaseReturn).sort()).toEqual(["createPurchaseReturnPostingHandler"]);
  });

  it("盘点 feature 的公开面带盘点的过账类型实现", () => {
    expect(Object.keys(stocktake).sort()).toEqual(["createStocktakePostingHandler"]);
  });
});
