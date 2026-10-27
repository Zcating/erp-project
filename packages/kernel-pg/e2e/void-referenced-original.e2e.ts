import {
  createDocumentService,
  createPostingService,
  createPurchaseInboundPostingHandler,
  createSaleOutboundPostingHandler,
  createSaleReturnPostingHandler,
  StateConflictError,
  ValidationError,
} from "@erp-inventory-sales/kernel";
import type {
  DocumentInput,
  TransactionContext,
  TransactionRunner,
} from "@erp-inventory-sales/kernel";
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

type Seed = {
  outboundId: string;
  inboundDocumentNo: string;
  outboundDocumentNo: string;
  originalLineId: string;
};

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
    code: uniqueCode("E2E-VREF-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const customer = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-VREF-CUS"),
    name: "杭州百货大楼",
    contact: null,
  };
  await customerRepository.insert(customer);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-VREF-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-VREF-SKU"),
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
  const seedOutbound = async (): Promise<Seed> => {
    const inbound = await documentService.create(inboundInput("10", "2"));
    await postingService.post(inbound.id);
    const outbound = await documentService.create(outboundInput("10"));
    await postingService.post(outbound.id);
    const reread = await documentService.get(outbound.id);
    const originalLineId = reread.lines[0]?.id;
    if (originalLineId === undefined) {
      throw new Error("销售出库单没有单据行");
    }
    return {
      outboundId: outbound.id,
      inboundDocumentNo: inbound.documentNo,
      outboundDocumentNo: outbound.documentNo,
      originalLineId,
    };
  };
  return {
    connection,
    documentRepository,
    documentService,
    handlers,
    item,
    ledgerRepository,
    postingService,
    returnInput,
    seedOutbound,
    warehouse,
  };
};

describe("端到端：禁止作废被已过账退货单引用的原单据（Postgres 适配器）", () => {
  it("作废被已过账销售退货单引用的销售出库单被拒，账面库存仍为 10.000，库存流水仍是三条且没有新增冲销流水", async () => {
    const fixture = await createFixture();
    try {
      const seed = await fixture.seedOutbound();
      const saleReturn = await fixture.documentService.create(
        fixture.returnInput(seed.originalLineId, "10"),
      );
      await fixture.postingService.post(saleReturn.id);

      const failure = await fixture.postingService.void(seed.outboundId).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(failure).toBeInstanceOf(StateConflictError);
      expect((failure as StateConflictError).message).toContain("已被过账的退货单引用");
      expect((failure as StateConflictError).message).toContain(saleReturn.documentNo);
      expect((failure as StateConflictError).message).toContain("请先作废退货单");

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.warehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("10.000");

      const inboundEntries = await fixture.ledgerRepository.listEntriesByDocumentNo(
        seed.inboundDocumentNo,
      );
      const outboundEntries = await fixture.ledgerRepository.listEntriesByDocumentNo(
        seed.outboundDocumentNo,
      );
      const returnEntries = await fixture.ledgerRepository.listEntriesByDocumentNo(
        saleReturn.documentNo,
      );
      expect(inboundEntries).toHaveLength(1);
      expect(outboundEntries).toHaveLength(1);
      expect(returnEntries).toHaveLength(1);
      expect(inboundEntries[0]?.quantityBefore).toBe("0.000");
      expect(inboundEntries[0]?.quantityAfter).toBe("10.000");
      expect(outboundEntries[0]?.quantityBefore).toBe("10.000");
      expect(outboundEntries[0]?.quantityAfter).toBe("0.000");
      expect(returnEntries[0]?.quantityBefore).toBe("0.000");
      expect(returnEntries[0]?.quantityAfter).toBe("10.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("先作废退货单、再作废原单据成功：作废退货单后账面库存 0.000，再作废原单据后回到 10.000，库存流水共五条", async () => {
    const fixture = await createFixture();
    try {
      const seed = await fixture.seedOutbound();
      const saleReturn = await fixture.documentService.create(
        fixture.returnInput(seed.originalLineId, "10"),
      );
      await fixture.postingService.post(saleReturn.id);

      await fixture.postingService.void(saleReturn.id);
      expect(
        (await fixture.ledgerRepository.findBalance(fixture.warehouse.id, fixture.item.id))
          ?.quantity,
      ).toBe("0.000");

      await fixture.postingService.void(seed.outboundId);
      expect(
        (await fixture.ledgerRepository.findBalance(fixture.warehouse.id, fixture.item.id))
          ?.quantity,
      ).toBe("10.000");

      const entries = [
        ...(await fixture.ledgerRepository.listEntriesByDocumentNo(seed.inboundDocumentNo)),
        ...(await fixture.ledgerRepository.listEntriesByDocumentNo(seed.outboundDocumentNo)),
        ...(await fixture.ledgerRepository.listEntriesByDocumentNo(saleReturn.documentNo)),
      ];
      expect(entries).toHaveLength(5);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("并发时退货单过账先拿到原单据行锁：作废原单据被拒，原单据没有被作废，退货单已过账", async () => {
    const fixture = await createFixture();
    try {
      const seed = await fixture.seedOutbound();
      const saleReturn = await fixture.documentService.create(
        fixture.returnInput(seed.originalLineId, "10"),
      );
      const draftStatus = saleReturn.status;
      const outboundStatusBefore = (await fixture.documentService.get(seed.outboundId)).status;

      const slowPosting = createPostingService({
        documents: fixture.documentRepository,
        ledger: fixture.ledgerRepository,
        handlers: fixture.handlers(),
        runner: slowRunner(fixture.connection.db, 800),
      });
      const fastPosting = createPostingService({
        documents: fixture.documentRepository,
        ledger: fixture.ledgerRepository,
        handlers: fixture.handlers(),
        runner: createTransactionRunner(fixture.connection.db),
      });

      const posting = slowPosting.post(saleReturn.id);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const voiding = fastPosting.void(seed.outboundId).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      const posted = await posting;
      const voidFailure = await voiding;

      expect(posted.status).not.toBe(draftStatus);
      expect(voidFailure).toBeInstanceOf(StateConflictError);

      const outboundAfter = await fixture.documentService.get(seed.outboundId);
      const rereadReturn = await fixture.documentService.get(saleReturn.id);
      expect(outboundAfter.status).toBe(outboundStatusBefore);
      expect(rereadReturn.status).not.toBe(draftStatus);
      expect(
        (await fixture.ledgerRepository.findBalance(fixture.warehouse.id, fixture.item.id))
          ?.quantity,
      ).toBe("10.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("并发时作废原单据先拿到行锁：退货单过账失败，原单据已作废，退货单没有过账", async () => {
    const fixture = await createFixture();
    try {
      const seed = await fixture.seedOutbound();
      const saleReturn = await fixture.documentService.create(
        fixture.returnInput(seed.originalLineId, "10"),
      );
      const draftStatus = saleReturn.status;
      const outboundStatusBefore = (await fixture.documentService.get(seed.outboundId)).status;

      const slowPosting = createPostingService({
        documents: fixture.documentRepository,
        ledger: fixture.ledgerRepository,
        handlers: fixture.handlers(),
        runner: slowRunner(fixture.connection.db, 800),
      });
      const fastPosting = createPostingService({
        documents: fixture.documentRepository,
        ledger: fixture.ledgerRepository,
        handlers: fixture.handlers(),
        runner: createTransactionRunner(fixture.connection.db),
      });

      const voiding = slowPosting.void(seed.outboundId);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const posting = fastPosting.post(saleReturn.id).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      const voided = await voiding;
      const postFailure = await posting;

      expect(voided.status).not.toBe(outboundStatusBefore);
      expect(postFailure).toBeInstanceOf(ValidationError);
      expect((postFailure as ValidationError).message).toContain("引用的原单据行尚未过账");

      const outboundAfter = await fixture.documentService.get(seed.outboundId);
      const rereadReturn = await fixture.documentService.get(saleReturn.id);
      expect(outboundAfter.status).not.toBe(outboundStatusBefore);
      expect(rereadReturn.status).toBe(draftStatus);
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
