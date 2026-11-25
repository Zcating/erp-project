import {
  createDocumentService,
  createPostingService,
  createPurchaseInboundPostingHandler,
  createSaleOutboundPostingHandler,
} from "@erp-project/kernel";
import type { DocumentInput, StockLedgerRepository } from "@erp-project/kernel";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createTransactionRunner } from "../src/db/transactions.js";
import { createDocumentRepository } from "../src/features/documents/repository.js";
import { createStockLedgerRepository } from "../src/features/inventory/repository.js";
import { createItemMasterRepository } from "../src/features/item-master/repository.js";
import {
  createCustomerRepository,
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
  const customerRepository = createCustomerRepository(connection.db);
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
      createSaleOutboundPostingHandler(ledgerRepository),
    ],
    runner,
  });
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-SOUT-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const customer = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-SOUT-CUS"),
    name: "杭州百货大楼",
    contact: null,
  };
  await customerRepository.insert(customer);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-SOUT-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-SOUT-SKU"),
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
    lines: [{ itemId: item.id, quantity: "12", unitPrice: "2", amount: null }],
    ...overrides,
  });
  const outboundInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
    type: "SALE_OUTBOUND",
    supplierId: null,
    customerId: customer.id,
    sourceWarehouseId: warehouse.id,
    targetWarehouseId: null,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity: "5", unitPrice: "3.5", amount: null }],
    ...overrides,
  });
  const seedStock = async (): Promise<void> => {
    const inbound = await documentService.create(inboundInput());
    await postingService.post(inbound.id);
  };
  return {
    connection,
    customer,
    documentRepository,
    documentService,
    inboundInput,
    item,
    ledgerRepository,
    outboundInput,
    postingService,
    seedStock,
    warehouse,
  };
};

describe("端到端：销售出库过账（Postgres 适配器）", () => {
  it("过账后读回的账面数量、加权成本与结转金额都是十进制文本，没有退化成二进制浮点", async () => {
    const fixture = await createFixture();
    try {
      await fixture.seedStock();
      const document = await fixture.documentService.create(fixture.outboundInput());

      await fixture.postingService.post(document.id);

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(typeof balance?.quantity).toBe("string");
      expect(typeof balance?.unitCost).toBe("string");
      expect(balance?.quantity).toBe("7.000");
      expect(balance?.unitCost).toBe("2.000000");

      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(typeof entries[0]?.amount).toBe("string");
      expect(typeof entries[0]?.unitPrice).toBe("string");
      expect(entries[0]?.amount).toBe("10.00");
      expect(entries[0]?.unitPrice).toBe("2.000000");
      expect(entries[0]?.quantityBefore).toBe("12.000");
      expect(entries[0]?.quantityAfter).toBe("7.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("库存不足时整单过账失败，库存数量与库存流水都不发生变化", async () => {
    const fixture = await createFixture();
    try {
      await fixture.seedStock();
      const document = await fixture.documentService.create(
        fixture.outboundInput({
          lines: [{ itemId: fixture.item.id, quantity: "13", unitPrice: "3.5", amount: null }],
        }),
      );

      await expect(fixture.postingService.post(document.id)).rejects.toThrow("禁止负库存");

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("12.000");
      expect(balance?.unitCost).toBe("2.000000");
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
      const document = await fixture.documentService.create(fixture.outboundInput());
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
          createSaleOutboundPostingHandler(failingLedger),
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
      expect(balance?.unitCost).toBe("2.000000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toEqual([]);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("作废后账面库存回到出库前，并追加一条数量相反的反向流水", async () => {
    const fixture = await createFixture();
    try {
      await fixture.seedStock();
      const document = await fixture.documentService.create(fixture.outboundInput());
      await fixture.postingService.post(document.id);

      const voided = await fixture.postingService.void(document.id);

      expect(voided.status).toBe("VOIDED");
      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("12.000");
      expect(balance?.unitCost).toBe("2.000000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toHaveLength(2);
      expect(entries[1]?.direction).toBe("REVERSAL");
      expect(entries[1]?.quantityBefore).toBe("7.000");
      expect(entries[1]?.quantityAfter).toBe("12.000");
      expect(entries[1]?.amount).toBe("-10.00");
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
