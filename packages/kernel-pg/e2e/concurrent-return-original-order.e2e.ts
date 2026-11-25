import {
  createDocumentService,
  createPostingService,
  createPurchaseInboundPostingHandler,
  createSaleOutboundPostingHandler,
  createSaleReturnPostingHandler,
} from "@erp-project/kernel";
import type { DocumentInput, DocumentRepository, TransactionContext } from "@erp-project/kernel";
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

const delayFirstLock = (repository: DocumentRepository): DocumentRepository => {
  const delayed = new Set<string>();
  const delayOnce = async (context?: TransactionContext): Promise<void> => {
    const transactionId = context?.transactionId;
    if (transactionId === undefined || delayed.has(transactionId)) {
      return;
    }
    delayed.add(transactionId);
    await new Promise((resolve) => setTimeout(resolve, 300));
  };
  return {
    ...repository,
    async findByLineIdForUpdate(lineId, context) {
      const document = await repository.findByLineIdForUpdate(lineId, context);
      await delayOnce(context);
      return document;
    },
  };
};

const createFixture = async () => {
  const connection = createDatabase(e2eDatabaseUrl());
  const documentRepository = createDocumentRepository(connection.db);
  const lockingRepository = delayFirstLock(documentRepository);
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
    createSaleReturnPostingHandler(ledgerRepository, lockingRepository),
  ];
  const postingService = createPostingService({
    documents: lockingRepository,
    ledger: ledgerRepository,
    handlers: handlers(),
    runner,
  });
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CLOCK-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const customer = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CLOCK-CUS"),
    name: "杭州百货大楼",
    contact: null,
  };
  await customerRepository.insert(customer);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CLOCK-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-CLOCK-SKU"),
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
  const returnInput = (
    lines: Array<{ originalLineId: string; quantity: string }>,
  ): DocumentInput => ({
    type: "SALE_RETURN",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: null,
    lines: lines.map((entry) => ({
      itemId: item.id,
      quantity: entry.quantity,
      unitPrice: null,
      amount: null,
      originalLineId: entry.originalLineId,
    })),
  });
  return {
    connection,
    documentService,
    item,
    ledgerRepository,
    postingService,
    returnInput,
    warehouse,
    inboundInput,
    outboundInput,
  };
};

describe("端到端：多原单据退货的确定性取锁顺序", () => {
  it("两张退货单以相反行序引用同一对原单据时，两笔并发过账都成功", async () => {
    const fixture = await createFixture();
    try {
      const inbound = await fixture.documentService.create(fixture.inboundInput("12", "2"));
      await fixture.postingService.post(inbound.id);
      const firstOutbound = await fixture.documentService.create(fixture.outboundInput("5"));
      await fixture.postingService.post(firstOutbound.id);
      const secondOutbound = await fixture.documentService.create(fixture.outboundInput("5"));
      await fixture.postingService.post(secondOutbound.id);

      const firstLineId = (await fixture.documentService.get(firstOutbound.id)).lines[0]?.id;
      const secondLineId = (await fixture.documentService.get(secondOutbound.id)).lines[0]?.id;
      if (firstLineId === undefined || secondLineId === undefined) {
        throw new Error("销售出库单没有单据行");
      }

      const forward = await fixture.documentService.create(
        fixture.returnInput([
          { originalLineId: firstLineId, quantity: "2" },
          { originalLineId: secondLineId, quantity: "2" },
        ]),
      );
      const backward = await fixture.documentService.create(
        fixture.returnInput([
          { originalLineId: secondLineId, quantity: "2" },
          { originalLineId: firstLineId, quantity: "2" },
        ]),
      );

      const firstPosting = fixture.postingService.post(forward.id);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const secondPosting = fixture.postingService.post(backward.id).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      const postedFirst = await firstPosting;
      const secondFailure = await secondPosting;

      expect(postedFirst.status).toBe("POSTED");
      expect(secondFailure).toBeUndefined();

      expect((await fixture.documentService.get(forward.id)).status).toBe("POSTED");
      expect((await fixture.documentService.get(backward.id)).status).toBe("POSTED");

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
