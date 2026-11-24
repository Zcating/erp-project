import {
  createDocumentService,
  createPostingService,
  createPurchaseInboundPostingHandler,
} from "@erp-project/kernel";
import type { DocumentInput, TransactionContext, TransactionRunner } from "@erp-project/kernel";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import type { KernelDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createTransactionRunner } from "../src/db/transactions.js";
import { createDocumentRepository } from "../src/features/documents/repository.js";
import { createStockLedgerRepository } from "../src/features/inventory/repository.js";
import { createItemMasterRepository } from "../src/features/item-master/repository.js";
import { createSupplierRepository } from "../src/features/parties/repository.js";
import { createWarehouseRepository } from "../src/features/parties/repository.js";

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const slowRunner = (db: KernelDatabase, delayMs: number): TransactionRunner => ({
  async run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      const context: TransactionContext = { transactionId: randomUUID(), handle: tx };
      const result = await work(context);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return result;
    });
  },
});

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
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CONC-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CONC-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CONC-SKU"),
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  };
  await itemRepository.insert(item);
  const input = (quantity: string, unitPrice: string): DocumentInput => ({
    type: "PURCHASE_INBOUND",
    supplierId: supplier.id,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: warehouse.id,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity, unitPrice, amount: null }],
  });
  return {
    connection,
    documentRepository,
    documentService,
    item,
    ledgerRepository,
    warehouse,
    input,
  };
};

describe("端到端：同 SKU 同仓的并发首次入库", () => {
  it("两单并发首次入库后账面数量等于两单入库量之和，没有一单被吞", async () => {
    const fixture = await createFixture();
    try {
      const first = await fixture.documentService.create(fixture.input("12", "1"));
      const second = await fixture.documentService.create(fixture.input("5", "2"));

      const firstPosting = createPostingService({
        documents: fixture.documentRepository,
        ledger: fixture.ledgerRepository,
        handlers: [createPurchaseInboundPostingHandler(fixture.ledgerRepository)],
        runner: slowRunner(fixture.connection.db, 500),
      });
      const secondPosting = createPostingService({
        documents: fixture.documentRepository,
        ledger: fixture.ledgerRepository,
        handlers: [createPurchaseInboundPostingHandler(fixture.ledgerRepository)],
        runner: createTransactionRunner(fixture.connection.db),
      });

      const firstResult = firstPosting.post(first.id);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const secondResult = secondPosting.post(second.id);
      const [postedFirst, postedSecond] = await Promise.all([firstResult, secondResult]);

      expect(postedFirst.status).toBe("POSTED");
      expect(postedSecond.status).toBe("POSTED");

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("17.000");
      expect(balance?.unitCost).toBe("1.294118");

      const firstEntries = await fixture.ledgerRepository.listEntriesByDocumentNo(first.documentNo);
      expect(firstEntries).toHaveLength(1);
      expect(firstEntries[0]?.quantityBefore).toBe("0.000");
      expect(firstEntries[0]?.quantityAfter).toBe("12.000");

      const secondEntries = await fixture.ledgerRepository.listEntriesByDocumentNo(
        second.documentNo,
      );
      expect(secondEntries).toHaveLength(1);
      expect(secondEntries[0]?.quantityBefore).toBe("12.000");
      expect(secondEntries[0]?.quantityAfter).toBe("17.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
