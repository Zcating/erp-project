import { describe, expect, it } from "vitest";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository.js";
import type { Document, DocumentInput } from "../documents/model.js";
import { createDocumentService } from "../documents/service.js";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository.js";
import { createItemMasterService } from "../item-master/service.js";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository.js";
import { createPostingService } from "../posting/service.js";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting.js";
import { StockNegativeError } from "../../shared/errors/index.js";
import { createStocktakePostingHandler } from "./stocktake-posting.js";

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const createFixture = async () => {
  const documents = createInMemoryDocumentRepository();
  const ledger = createInMemoryStockLedgerRepository();
  const items = createInMemoryItemMasterRepository();
  const itemService = createItemMasterService(items);
  let counter = 0;
  const documentService = createDocumentService(documents, {
    idGenerator: () => `doc-${++counter}`,
    clock: () => FIXED_CLOCK,
    timeZone: "Asia/Shanghai",
    itemLookup: items,
  });
  const postingService = createPostingService({
    documents,
    ledger,
    handlers: [createPurchaseInboundPostingHandler(ledger), createStocktakePostingHandler(ledger)],
  });
  const item = await itemService.create({
    code: "SKU-001",
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  });
  const other = await itemService.create({
    code: "SKU-002",
    barcode: null,
    name: "雪碧",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  });
  return { documents, ledger, documentService, postingService, item, other };
};

const purchaseInboundInput = (
  itemId: string,
  overrides: Partial<DocumentInput> = {},
): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId, quantity: "12", unitPrice: "2", amount: null }],
  ...overrides,
});

const stocktakeInput = (
  itemId: string,
  quantityText: string,
  overrides: Partial<DocumentInput> = {},
): DocumentInput => ({
  type: "STOCKTAKE",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: "warehouse-1",
  lines: [{ itemId, quantity: quantityText, unitPrice: null, amount: null }],
  ...overrides,
});

const seedStock = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  quantityText = "12",
  unitPriceText = "2",
): Promise<void> => {
  const inbound = await fixture.documentService.create(
    purchaseInboundInput(fixture.item.id, {
      lines: [
        { itemId: fixture.item.id, quantity: quantityText, unitPrice: unitPriceText, amount: null },
      ],
    }),
  );
  await fixture.postingService.post(inbound.id);
};

const insertRawStocktake = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  lines: Array<{ itemId: string; quantity: string }>,
): Promise<Document> => {
  const document: Document = {
    id: "raw-stocktake",
    documentNo: "STK-20260102-901",
    type: "STOCKTAKE",
    status: "DRAFT",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: "warehouse-1",
    lines: lines.map((line, index) => ({
      id: `raw-line-${index + 1}`,
      lineNo: index + 1,
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: null,
      amount: null,
      originalLineId: null,
    })),
  };
  await fixture.documents.insert(document);
  return document;
};

describe("盘点过账的库存影响", () => {
  it("实盘数量大于账面数量时过账后账面库存增加差额", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "15"));

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("15.000");
  });

  it("盘盈的库存流水记录这笔入库，金额按当前加权平均成本计算", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "15"));

    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      direction: "POST",
      lineNo: 1,
      warehouseId: "warehouse-1",
      itemId: fixture.item.id,
      quantityBefore: "12.000",
      quantityAfter: "15.000",
      unitPrice: "2.000000",
      amount: "6.00",
    });
  });

  it("盘盈按当前加权平均成本入库，该商品在该仓的加权平均成本保持不变", async () => {
    const fixture = await createFixture();
    await seedStock(fixture, "10", "1");
    await seedStock(fixture, "10", "2");
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "25"));

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("25.000");
    expect(balance?.unitCost).toBe("1.500000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.costBefore).toBe("1.500000");
    expect(entries[0]?.costAfter).toBe("1.500000");
    expect(entries[0]?.unitPrice).toBe("1.500000");
    expect(entries[0]?.amount).toBe("7.50");
  });

  it("实盘数量小于账面数量时过账后账面库存减少差额，流水记录这笔出库，金额按当前加权平均成本计算", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "9"));

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("9.000");
    expect(balance?.unitCost).toBe("2.000000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      direction: "POST",
      quantityBefore: "12.000",
      quantityAfter: "9.000",
      costBefore: "2.000000",
      costAfter: "2.000000",
      unitPrice: "2.000000",
      amount: "6.00",
    });
  });

  it("实盘数量为 0 时按盘亏全额出库，该商品在该仓的账面库存变为 0", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "0"));

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("0.000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      quantityBefore: "12.000",
      quantityAfter: "0.000",
      unitPrice: "2.000000",
      amount: "24.00",
    });
  });

  it("实盘数量等于账面数量时过账成功，账面库存不变，且该单据在库存流水里查不到任何行", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "12"));

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(balance?.unitCost).toBe("2.000000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect(
      await fixture.ledger.listMovements({
        documentNo: document.documentNo,
        warehouseId: null,
        itemId: null,
        lineNo: null,
        occurredFrom: null,
        occurredTo: null,
        order: "asc",
      }),
    ).toEqual([]);
  });

  it("盘点行的实盘数量不参与计价，结转金额只按当前加权平均成本算", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "9"));

    await fixture.postingService.post(document.id);

    expect(document.lines[0]?.unitPrice).toBeNull();
    expect(document.lines[0]?.amount).toBeNull();
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.unitPrice).toBe("2.000000");
    expect(entries[0]?.amount).toBe("6.00");
  });

  it("盘亏导致账面库存为负时整单过账失败，失败后库存与库存流水都不发生变化", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await insertRawStocktake(fixture, [
      { itemId: fixture.item.id, quantity: "-1" },
    ]);

    const failure = await fixture.postingService.post(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    expect((failure as StockNegativeError).code).toBe("STOCK_NEGATIVE");
    expect((failure as StockNegativeError).message).toContain("禁止负库存");
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });

  it("含两行、其中一行盘亏会导致账面库存为负时整单失败，第一行对应的库存与流水都没有写入", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await insertRawStocktake(fixture, [
      { itemId: fixture.item.id, quantity: "15" },
      { itemId: fixture.other.id, quantity: "-1" },
    ]);

    const failure = await fixture.postingService.post(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });

  it("已过账的盘点单作废后，账面库存回到过账前的数值，并新增一条数量相反的反向流水", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "15"));
    await fixture.postingService.post(document.id);

    await fixture.postingService.void(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(balance?.unitCost).toBe("2.000000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.direction).toBe("POST");
    expect(entries[1]).toMatchObject({
      direction: "REVERSAL",
      lineNo: 1,
      quantityBefore: "15.000",
      quantityAfter: "12.000",
      costBefore: "2.000000",
      costAfter: "2.000000",
      unitPrice: "2.000000",
      amount: "-6.00",
    });
  });

  it("盘亏的盘点单作废后，账面库存回到过账前的数值，反向流水数量与原流水相反", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "9"));
    await fixture.postingService.post(document.id);

    await fixture.postingService.void(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      direction: "REVERSAL",
      quantityBefore: "9.000",
      quantityAfter: "12.000",
      amount: "-6.00",
    });
  });

  it("零差异的盘点单作废后账面库存不变，库存流水里只有原过账那条记录", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "12"));
    await fixture.postingService.post(document.id);

    const voided = await fixture.postingService.void(document.id);

    expect(voided.status).toBe("VOIDED");
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
  });
});
