import {
  createDocumentService,
  createPostingService,
  createPurchaseInboundPostingHandler,
} from "@erp-project/kernel";
import type { DocumentInput, StockLedgerRepository } from "@erp-project/kernel";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createTransactionRunner } from "../src/db/transactions.js";
import { createDocumentRepository } from "../src/features/documents/repository.js";
import { createStockLedgerRepository } from "../src/features/inventory/repository.js";
import { createItemMasterRepository } from "../src/features/item-master/repository.js";
import { createSupplierRepository } from "../src/features/parties/repository.js";
import { createWarehouseRepository } from "../src/features/parties/repository.js";

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
    handlers: [createPurchaseInboundPostingHandler(ledgerRepository)],
    runner,
  });
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-POST-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-POST-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-POST-SKU"),
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  };
  await itemRepository.insert(item);
  const input = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
    type: "PURCHASE_INBOUND",
    supplierId: supplier.id,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: warehouse.id,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity: "12", unitPrice: "1.115", amount: null }],
    ...overrides,
  });
  return {
    connection,
    documentRepository,
    documentService,
    item,
    itemRepository,
    ledgerRepository,
    postingService,
    warehouse,
    input,
  };
};

describe("端到端：采购入库过账（Postgres 适配器）", () => {
  it("过账后读回的账面数量、加权成本与结转金额都是十进制文本，没有退化成二进制浮点", async () => {
    const fixture = await createFixture();
    try {
      const document = await fixture.documentService.create(fixture.input());

      await fixture.postingService.post(document.id);

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(typeof balance?.quantity).toBe("string");
      expect(typeof balance?.unitCost).toBe("string");
      expect(balance?.quantity).toBe("12.000");
      expect(balance?.unitCost).toBe("1.115000");

      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(typeof entries[0]?.amount).toBe("string");
      expect(typeof entries[0]?.unitPrice).toBe("string");
      expect(entries[0]?.amount).toBe("13.38");
      expect(entries[0]?.unitPrice).toBe("1.115000");
      expect(entries[0]?.quantityAfter).toBe("12.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("同一张单连续过账两次，第二次成功，库存数量、流水条数与加权平均成本都不变", async () => {
    const fixture = await createFixture();
    try {
      const document = await fixture.documentService.create(fixture.input());

      const first = await fixture.postingService.post(document.id);
      const second = await fixture.postingService.post(document.id);

      expect(first.status).toBe("POSTED");
      expect(second.status).toBe("POSTED");
      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("12.000");
      expect(balance?.unitCost).toBe("1.115000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toHaveLength(1);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("过账过程中失败时单据仍为草稿，已经写下的库存台账也没有留下", async () => {
    const fixture = await createFixture();
    try {
      const document = await fixture.documentService.create(fixture.input());
      const failingLedger: StockLedgerRepository = {
        ...fixture.ledgerRepository,
        async appendEntries(): Promise<void> {
          throw new Error("模拟写库存流水失败");
        },
      };
      const failingPostingService = createPostingService({
        documents: fixture.documentRepository,
        ledger: failingLedger,
        handlers: [createPurchaseInboundPostingHandler(failingLedger)],
        runner: createTransactionRunner(fixture.connection.db),
      });

      await expect(failingPostingService.post(document.id)).rejects.toThrow("模拟写库存流水失败");

      const reread = await fixture.documentService.get(document.id);
      expect(reread.status).toBe("DRAFT");
      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance).toBeNull();
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toEqual([]);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("作废后库存与加权成本回到过账前，并追加一条数量相反的反向流水", async () => {
    const fixture = await createFixture();
    try {
      const document = await fixture.documentService.create(fixture.input());
      await fixture.postingService.post(document.id);

      const voided = await fixture.postingService.void(document.id);

      expect(voided.status).toBe("VOIDED");
      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("0.000");
      expect(balance?.unitCost).toBe("0.000000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toHaveLength(2);
      expect(entries[1]?.direction).toBe("REVERSAL");
      expect(entries[1]?.quantityBefore).toBe("12.000");
      expect(entries[1]?.quantityAfter).toBe("0.000");
      expect(entries[1]?.amount).toBe("-13.38");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("已过账单据引用过的商品在数据库层被外键挡住，商品档案仍在", async () => {
    const fixture = await createFixture();
    try {
      const document = await fixture.documentService.create(fixture.input());
      await fixture.postingService.post(document.id);

      const error = await fixture.itemRepository.remove(fixture.item.id).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(error).toBeDefined();
      expect(await fixture.itemRepository.findById(fixture.item.id)).not.toBeNull();
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("草稿引用的商品不受外键约束，仍然可以删除", async () => {
    const fixture = await createFixture();
    try {
      await fixture.documentService.create(fixture.input());

      await expect(fixture.itemRepository.remove(fixture.item.id)).resolves.toBe(true);
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
