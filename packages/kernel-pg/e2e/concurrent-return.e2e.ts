import {
  createDocumentService,
  createPostingService,
  createPurchaseInboundPostingHandler,
  createSaleOutboundPostingHandler,
  createSaleReturnPostingHandler,
  ValidationError,
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
import {
  createCustomerRepository,
  createSupplierRepository,
  createWarehouseRepository,
} from "../src/features/parties/repository.js";

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
  const customerRepository = createCustomerRepository(connection.db);
  const warehouseRepository = createWarehouseRepository(connection.db);
  const runner = createTransactionRunner(connection.db);
  const documentService = createDocumentService(documentRepository, {
    runner,
    clock: () => new Date(),
    timeZone: "Asia/Shanghai",
    itemLookup: itemRepository,
  });
  const handlers = () => [
    createPurchaseInboundPostingHandler(ledgerRepository),
    createSaleOutboundPostingHandler(ledgerRepository),
    createSaleReturnPostingHandler(ledgerRepository, documentRepository),
  ];
  const postingService = createPostingService({
    documents: documentRepository,
    ledger: ledgerRepository,
    handlers: handlers(),
    runner,
  });
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CRET-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const customer = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CRET-CUS"),
    name: "杭州百货大楼",
    contact: null,
  };
  await customerRepository.insert(customer);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CRET-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CRET-SKU"),
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
  const returnInput = (originalLineId: string, quantity: string): DocumentInput => ({
    type: "SALE_RETURN",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity, unitPrice: null, amount: null, originalLineId }],
  });
  return {
    connection,
    documentRepository,
    documentService,
    handlers,
    item,
    ledgerRepository,
    outboundInput,
    inboundInput,
    postingService,
    returnInput,
    warehouse,
  };
};

describe("端到端：同一原单行的并发销售退货", () => {
  it("两单并发退货合计超过原行数量时，只有一单成功，另一单被超退守卫拦下", async () => {
    const fixture = await createFixture();
    try {
      const inbound = await fixture.documentService.create(fixture.inboundInput("12", "2"));
      await fixture.postingService.post(inbound.id);
      const outbound = await fixture.documentService.create(fixture.outboundInput("5"));
      await fixture.postingService.post(outbound.id);
      const reread = await fixture.documentService.get(outbound.id);
      const originalLineId = reread.lines[0]?.id;
      if (originalLineId === undefined) {
        throw new Error("销售出库单没有单据行");
      }

      const first = await fixture.documentService.create(fixture.returnInput(originalLineId, "3"));
      const second = await fixture.documentService.create(fixture.returnInput(originalLineId, "3"));

      const slowPosting = createPostingService({
        documents: fixture.documentRepository,
        ledger: fixture.ledgerRepository,
        handlers: fixture.handlers(),
        runner: slowRunner(fixture.connection.db, 500),
      });
      const fastPosting = createPostingService({
        documents: fixture.documentRepository,
        ledger: fixture.ledgerRepository,
        handlers: fixture.handlers(),
        runner: createTransactionRunner(fixture.connection.db),
      });

      const firstResult = slowPosting.post(first.id);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const secondOutcome = fastPosting.post(second.id).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      const postedFirst = await firstResult;
      const postedSecond = await secondOutcome;

      expect(postedFirst.status).toBe("POSTED");
      expect(postedSecond).toBeInstanceOf(ValidationError);
      expect((postedSecond as ValidationError).message).toContain("超退 1.000");

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("10.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
