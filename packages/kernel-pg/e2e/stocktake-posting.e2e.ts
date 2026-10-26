import {
  createDocumentService,
  createPostingService,
  createPurchaseInboundPostingHandler,
  createStocktakePostingHandler,
} from "@erp-inventory-sales/kernel";
import type { Document, DocumentInput, StockLedgerRepository } from "@erp-inventory-sales/kernel";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createTransactionRunner } from "../src/db/transactions.js";
import { createDocumentRepository } from "../src/features/documents/repository.js";
import { createStockLedgerRepository } from "../src/features/inventory/repository.js";
import { createItemMasterRepository } from "../src/features/item-master/repository.js";
import {
  createSupplierRepository,
  createWarehouseRepository,
} from "../src/features/parties/repository.js";

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const createFixture = async () => {
  const connection = createDatabase(e2eDatabaseUrl());
  const documentRepository = createDocumentRepository(connection.db);
  const ledgerRepository = createStockLedgerRepository(connection.db);
  const itemRepository = createItemMasterRepository(connection.db);
  const supplierRepository = createSupplierRepository(connection.db);
  const warehouseRepository = createWarehouseRepository(connection.db);
  const runner = createTransactionRunner(connection.db);
  const documentService = createDocumentService(documentRepository, {
    runner,
    clock: () => new Date(),
    timeZone: "Asia/Shanghai",
    itemLookup: itemRepository,
  });
  const postingService = createPostingService({
    documents: documentRepository,
    ledger: ledgerRepository,
    handlers: [
      createPurchaseInboundPostingHandler(ledgerRepository),
      createStocktakePostingHandler(ledgerRepository),
    ],
    runner,
  });
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-STK-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-STK-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-STK-SKU"),
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  };
  await itemRepository.insert(item);
  const inboundInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
    type: "PURCHASE_INBOUND",
    supplierId: supplier.id,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: warehouse.id,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity: "12", unitPrice: "1.115", amount: null }],
    ...overrides,
  });
  const stocktakeInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
    type: "STOCKTAKE",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: warehouse.id,
    lines: [{ itemId: item.id, quantity: "15", unitPrice: null, amount: null }],
    ...overrides,
  });
  const seedStock = async (): Promise<void> => {
    const inbound = await documentService.create(inboundInput());
    await postingService.post(inbound.id);
  };
  return {
    connection,
    documentRepository,
    documentService,
    inboundInput,
    item,
    ledgerRepository,
    postingService,
    seedStock,
    stocktakeInput,
    warehouse,
  };
};

const insertRawStocktake = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  lines: Array<{ itemId: string; quantity: string }>,
): Promise<Document> => {
  const document: Document = {
    id: crypto.randomUUID(),
    documentNo: `STK-E2E-${uniqueCode("RAW")}`,
    type: "STOCKTAKE",
    status: "DRAFT",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: fixture.warehouse.id,
    lines: lines.map((line, index) => ({
      id: crypto.randomUUID(),
      lineNo: index + 1,
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: null,
      amount: null,
      originalLineId: null,
    })),
  };
  await fixture.documentRepository.insert(document);
  return document;
};

describe("端到端：盘点过账（Postgres 适配器）", () => {
  it("过账后读回的账面数量、加权成本与结转金额都是十进制文本，没有退化成二进制浮点", async () => {
    const fixture = await createFixture();
    try {
      await fixture.seedStock();
      const document = await fixture.documentService.create(fixture.stocktakeInput());

      await fixture.postingService.post(document.id);

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(typeof balance?.quantity).toBe("string");
      expect(typeof balance?.unitCost).toBe("string");
      expect(balance?.quantity).toBe("15.000");
      expect(balance?.unitCost).toBe("1.115000");

      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(typeof entries[0]?.amount).toBe("string");
      expect(typeof entries[0]?.unitPrice).toBe("string");
      expect(entries[0]?.amount).toBe("3.35");
      expect(entries[0]?.unitPrice).toBe("1.115000");
      expect(entries[0]?.quantityBefore).toBe("12.000");
      expect(entries[0]?.quantityAfter).toBe("15.000");
      expect(entries[0]?.costBefore).toBe("1.115000");
      expect(entries[0]?.costAfter).toBe("1.115000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("实盘数量等于账面数量时过账成功，账面库存不变，库存流水里查不到该单任何行", async () => {
    const fixture = await createFixture();
    try {
      await fixture.seedStock();
      const document = await fixture.documentService.create(
        fixture.stocktakeInput({
          lines: [{ itemId: fixture.item.id, quantity: "12", unitPrice: null, amount: null }],
        }),
      );

      await fixture.postingService.post(document.id);

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("12.000");
      expect(balance?.unitCost).toBe("1.115000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toEqual([]);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("盘亏导致账面库存为负时整单过账失败，库存与库存流水都不发生变化", async () => {
    const fixture = await createFixture();
    try {
      await fixture.seedStock();
      const document = await insertRawStocktake(fixture, [
        { itemId: fixture.item.id, quantity: "-1" },
      ]);

      await expect(fixture.postingService.post(document.id)).rejects.toThrow("禁止负库存");

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("12.000");
      expect(balance?.unitCost).toBe("1.115000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toEqual([]);
      const reread = await fixture.documentService.get(document.id);
      expect(reread.status).toBe("DRAFT");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("过账过程中失败时单据仍为草稿，已经写下的库存台账也没有留下", async () => {
    const fixture = await createFixture();
    try {
      await fixture.seedStock();
      const document = await fixture.documentService.create(fixture.stocktakeInput());
      const failingLedger: StockLedgerRepository = {
        ...fixture.ledgerRepository,
        async appendEntries(): Promise<void> {
          throw new Error("模拟写库存流水失败");
        },
      };
      const failingPostingService = createPostingService({
        documents: fixture.documentRepository,
        ledger: failingLedger,
        handlers: [
          createPurchaseInboundPostingHandler(failingLedger),
          createStocktakePostingHandler(failingLedger),
        ],
        runner: createTransactionRunner(fixture.connection.db),
      });

      await expect(failingPostingService.post(document.id)).rejects.toThrow("模拟写库存流水失败");

      const reread = await fixture.documentService.get(document.id);
      expect(reread.status).toBe("DRAFT");
      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("12.000");
      expect(balance?.unitCost).toBe("1.115000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toEqual([]);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("作废后账面库存回到过账前，并追加一条数量相反的反向流水", async () => {
    const fixture = await createFixture();
    try {
      await fixture.seedStock();
      const document = await fixture.documentService.create(fixture.stocktakeInput());
      await fixture.postingService.post(document.id);

      const voided = await fixture.postingService.void(document.id);

      expect(voided.status).toBe("VOIDED");
      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("12.000");
      expect(balance?.unitCost).toBe("1.115000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toHaveLength(2);
      expect(entries[1]?.direction).toBe("REVERSAL");
      expect(entries[1]?.quantityBefore).toBe("15.000");
      expect(entries[1]?.quantityAfter).toBe("12.000");
      expect(entries[1]?.amount).toBe("-3.35");
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
