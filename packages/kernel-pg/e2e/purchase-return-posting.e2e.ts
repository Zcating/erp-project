import {
  createDocumentService,
  createPostingService,
  createPurchaseInboundPostingHandler,
  createPurchaseReturnPostingHandler,
  createSaleOutboundPostingHandler,
} from "@erp-inventory-sales/kernel";
import type { DocumentInput, StockLedgerRepository } from "@erp-inventory-sales/kernel";
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
      createPurchaseReturnPostingHandler(ledgerRepository, documentRepository),
    ],
    runner,
  });
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-PRET-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const customer = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-PRET-CUS"),
    name: "杭州百货大楼",
    contact: null,
  };
  await customerRepository.insert(customer);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-PRET-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-PRET-SKU"),
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  };
  await itemRepository.insert(item);
  const inboundInput = (quantity: string, unitPrice: string): DocumentInput => ({
    type: "PURCHASE_INBOUND",
    supplierId: supplier.id,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: warehouse.id,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity, unitPrice, amount: null }],
  });
  const outboundInput = (quantity: string): DocumentInput => ({
    type: "SALE_OUTBOUND",
    supplierId: null,
    customerId: customer.id,
    sourceWarehouseId: warehouse.id,
    targetWarehouseId: null,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity, unitPrice: "3.5", amount: null }],
  });
  const seedInbound = async (
    inboundQuantity: string,
    inboundUnitPrice: string,
  ): Promise<string> => {
    const inbound = await documentService.create(inboundInput(inboundQuantity, inboundUnitPrice));
    await postingService.post(inbound.id);
    const reread = await documentService.get(inbound.id);
    const lineId = reread.lines[0]?.id;
    if (lineId === undefined) {
      throw new Error("采购入库单没有单据行");
    }
    return lineId;
  };
  const returnInput = (originalLineId: string, quantity: string): DocumentInput => ({
    type: "PURCHASE_RETURN",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: null,
    lines: [
      {
        itemId: item.id,
        quantity,
        unitPrice: null,
        amount: null,
        originalLineId,
      },
    ],
  });
  return {
    connection,
    documentRepository,
    documentService,
    item,
    inboundInput,
    ledgerRepository,
    outboundInput,
    postingService,
    returnInput,
    seedInbound,
    warehouse,
  };
};

describe("端到端：采购退货过账（Postgres 适配器）", () => {
  it("过账后读回的账面数量、成本单价与结转金额都是十进制文本，没有退化成二进制浮点", async () => {
    const fixture = await createFixture();
    try {
      const originalLineId = await fixture.seedInbound("10", "2");
      const document = await fixture.documentService.create(
        fixture.returnInput(originalLineId, "4"),
      );

      await fixture.postingService.post(document.id);

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(typeof balance?.quantity).toBe("string");
      expect(typeof balance?.unitCost).toBe("string");
      expect(balance?.quantity).toBe("6.000");
      expect(balance?.unitCost).toBe("2.000000");

      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(typeof entries[0]?.amount).toBe("string");
      expect(typeof entries[0]?.unitPrice).toBe("string");
      expect(entries[0]?.amount).toBe("8.00");
      expect(entries[0]?.unitPrice).toBe("2.000000");
      expect(entries[0]?.quantityBefore).toBe("10.000");
      expect(entries[0]?.quantityAfter).toBe("6.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("结转成本取过账当时的当前加权平均成本：再入库一批后加权成本 2.50，退货 4 瓶结转 10.00", async () => {
    const fixture = await createFixture();
    try {
      const originalLineId = await fixture.seedInbound("10", "2");
      const second = await fixture.documentService.create(fixture.inboundInput("10", "3"));
      await fixture.postingService.post(second.id);
      const document = await fixture.documentService.create(
        fixture.returnInput(originalLineId, "4"),
      );

      await fixture.postingService.post(document.id);

      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries[0]?.unitPrice).toBe("2.500000");
      expect(entries[0]?.amount).toBe("10.00");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("累计退货数量超过原行已过账数量时过账失败，库存数量与库存流水都不发生变化", async () => {
    const fixture = await createFixture();
    try {
      const originalLineId = await fixture.seedInbound("10", "2");
      const first = await fixture.documentService.create(fixture.returnInput(originalLineId, "6"));
      await fixture.postingService.post(first.id);
      const second = await fixture.documentService.create(fixture.returnInput(originalLineId, "3"));
      await fixture.postingService.post(second.id);
      const third = await fixture.documentService.create(fixture.returnInput(originalLineId, "2"));

      await expect(fixture.postingService.post(third.id)).rejects.toThrow("超退 1.000");

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("1.000");
      expect(await fixture.ledgerRepository.listEntriesByDocumentNo(third.documentNo)).toEqual([]);
      const reread = await fixture.documentService.get(third.id);
      expect(reread.status).toBe("DRAFT");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("库存不足时整单过账失败，库存数量与库存流水都不发生变化", async () => {
    const fixture = await createFixture();
    try {
      const originalLineId = await fixture.seedInbound("10", "2");
      const outbound = await fixture.documentService.create(fixture.outboundInput("7"));
      await fixture.postingService.post(outbound.id);
      const document = await fixture.documentService.create(
        fixture.returnInput(originalLineId, "4"),
      );

      await expect(fixture.postingService.post(document.id)).rejects.toThrow("禁止负库存");

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("3.000");
      expect(await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo)).toEqual(
        [],
      );
      const reread = await fixture.documentService.get(document.id);
      expect(reread.status).toBe("DRAFT");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("过账过程中失败时单据仍为草稿，已经写下的库存台账也没有留下", async () => {
    const fixture = await createFixture();
    try {
      const originalLineId = await fixture.seedInbound("10", "2");
      const document = await fixture.documentService.create(
        fixture.returnInput(originalLineId, "4"),
      );
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
          createPurchaseReturnPostingHandler(failingLedger, fixture.documentRepository),
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
      expect(balance?.quantity).toBe("10.000");
      expect(await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo)).toEqual(
        [],
      );
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("作废后账面库存回到退货前，并追加一条金额相反的反向流水", async () => {
    const fixture = await createFixture();
    try {
      const originalLineId = await fixture.seedInbound("10", "2");
      const document = await fixture.documentService.create(
        fixture.returnInput(originalLineId, "4"),
      );
      await fixture.postingService.post(document.id);

      const voided = await fixture.postingService.void(document.id);

      expect(voided.status).toBe("VOIDED");
      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("10.000");
      expect(balance?.unitCost).toBe("2.000000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toHaveLength(2);
      expect(entries[1]?.direction).toBe("REVERSAL");
      expect(entries[1]?.quantityBefore).toBe("6.000");
      expect(entries[1]?.quantityAfter).toBe("10.000");
      expect(entries[1]?.amount).toBe("-8.00");
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
