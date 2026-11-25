import {
  createDocumentService,
  createInventoryQueryService,
  createPostingService,
} from "@erp-project/kernel";
import { createPurchaseInboundPostingHandler } from "@erp-project/kernel";
import type { DocumentInput } from "@erp-project/kernel";
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

const QUANTITY_TEXT = /^-?\d+\.\d{3}$/;
const UNIT_PRICE_TEXT = /^-?\d+\.\d{6}$/;
const AMOUNT_TEXT = /^-?\d+\.\d{2}$/;

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
    code: uniqueCode("E2E-QRY-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-QRY-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const otherWarehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-QRY-WH2"),
    name: "杭州分仓",
    purpose: null,
  };
  await warehouseRepository.insert(otherWarehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-QRY-SKU"),
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
    documentService,
    item,
    ledgerRepository,
    otherWarehouse,
    postingService,
    warehouse,
    input,
  };
};

describe("端到端：库存查询与库存流水（Postgres 适配器）", () => {
  it("库存查询读回的账面数量、可用数量、在途数量与加权成本都是十进制文本，没有退化成二进制浮点", async () => {
    const fixture = await createFixture();
    try {
      const document = await fixture.documentService.create(fixture.input());
      await fixture.postingService.post(document.id);

      const service = createInventoryQueryService(fixture.ledgerRepository);
      const balances = await service.listBalances({
        warehouseId: fixture.warehouse.id,
        itemId: fixture.item.id,
      });

      expect(balances).toHaveLength(1);
      const balance = balances[0];
      expect(typeof balance?.onHand).toBe("string");
      expect(typeof balance?.available).toBe("string");
      expect(typeof balance?.inTransit).toBe("string");
      expect(typeof balance?.unitCost).toBe("string");
      expect(balance?.onHand).toBe("12.000");
      expect(balance?.available).toBe("12.000");
      expect(balance?.inTransit).toBe("0.000");
      expect(balance?.unitCost).toBe("1.115000");
      expect(balance?.onHand).toMatch(QUANTITY_TEXT);
      expect(balance?.available).toMatch(QUANTITY_TEXT);
      expect(balance?.inTransit).toMatch(QUANTITY_TEXT);
      expect(balance?.unitCost).toMatch(UNIT_PRICE_TEXT);
      expect(Object.keys(balance ?? {})).not.toContain("quantity");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("库存流水读回的变动前后数量、单价与结转金额都是十进制文本", async () => {
    const fixture = await createFixture();
    try {
      const document = await fixture.documentService.create(fixture.input());
      await fixture.postingService.post(document.id);

      const service = createInventoryQueryService(fixture.ledgerRepository);
      const movements = await service.listMovements({
        documentNo: document.documentNo,
        warehouseId: null,
        itemId: null,
        lineNo: null,
        occurredFrom: null,
        occurredTo: null,
        order: "asc",
      });

      expect(movements).toHaveLength(1);
      const movement = movements[0];
      expect(typeof movement?.quantityBefore).toBe("string");
      expect(typeof movement?.quantityAfter).toBe("string");
      expect(typeof movement?.unitPrice).toBe("string");
      expect(typeof movement?.amount).toBe("string");
      expect(movement?.quantityBefore).toBe("0.000");
      expect(movement?.quantityAfter).toBe("12.000");
      expect(movement?.unitPrice).toBe("1.115000");
      expect(movement?.amount).toBe("13.38");
      expect(movement?.quantityAfter).toMatch(QUANTITY_TEXT);
      expect(movement?.unitPrice).toMatch(UNIT_PRICE_TEXT);
      expect(movement?.amount).toMatch(AMOUNT_TEXT);
      expect(typeof movement?.occurredAt).toBe("string");
      expect(Number.isNaN(Date.parse(movement?.occurredAt ?? ""))).toBe(false);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("库存查询可按仓库与商品过滤，切换仓库后读到的是该仓库自己的口径值", async () => {
    const fixture = await createFixture();
    try {
      const inFirst = await fixture.documentService.create(fixture.input());
      await fixture.postingService.post(inFirst.id);
      const inSecond = await fixture.documentService.create(
        fixture.input({
          targetWarehouseId: fixture.otherWarehouse.id,
          lines: [{ itemId: fixture.item.id, quantity: "3", unitPrice: "1.115", amount: null }],
        }),
      );
      await fixture.postingService.post(inSecond.id);

      const service = createInventoryQueryService(fixture.ledgerRepository);
      const firstWarehouse = await service.listBalances({
        warehouseId: fixture.warehouse.id,
        itemId: fixture.item.id,
      });
      const secondWarehouse = await service.listBalances({
        warehouseId: fixture.otherWarehouse.id,
        itemId: fixture.item.id,
      });

      expect(firstWarehouse[0]?.onHand).toBe("12.000");
      expect(firstWarehouse[0]?.available).toBe("12.000");
      expect(firstWarehouse[0]?.inTransit).toBe("0.000");
      expect(secondWarehouse[0]?.onHand).toBe("3.000");
      expect(secondWarehouse[0]?.available).toBe("3.000");
      expect(secondWarehouse[0]?.inTransit).toBe("0.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("库存流水可按单据号、行号、仓库、商品与时间筛选，并可按发生时间排序", async () => {
    const fixture = await createFixture();
    try {
      const first = await fixture.documentService.create(fixture.input());
      await fixture.postingService.post(first.id);
      const second = await fixture.documentService.create(
        fixture.input({
          lines: [
            { itemId: fixture.item.id, quantity: "1", unitPrice: "1.115", amount: null },
            { itemId: fixture.item.id, quantity: "2", unitPrice: "1.115", amount: null },
          ],
        }),
      );
      await fixture.postingService.post(second.id);

      const service = createInventoryQueryService(fixture.ledgerRepository);
      const base = {
        documentNo: null,
        warehouseId: fixture.warehouse.id,
        itemId: fixture.item.id,
        lineNo: null,
        occurredFrom: null,
        occurredTo: null,
        order: "asc" as const,
      };

      const byDocumentNo = await service.listMovements({
        ...base,
        warehouseId: null,
        itemId: null,
        documentNo: second.documentNo,
      });
      expect(byDocumentNo).toHaveLength(2);
      expect(byDocumentNo.map((movement) => movement.lineNo)).toEqual([1, 2]);

      const byLineNo = await service.listMovements({ ...base, lineNo: 2 });
      expect(byLineNo).toHaveLength(1);
      expect(byLineNo[0]?.documentNo).toBe(second.documentNo);

      const byWarehouse = await service.listMovements({
        ...base,
        itemId: null,
        warehouseId: fixture.warehouse.id,
      });
      expect(byWarehouse).toHaveLength(3);

      const byItem = await service.listMovements({
        ...base,
        warehouseId: null,
        itemId: fixture.item.id,
      });
      expect(byItem).toHaveLength(3);

      const inRange = await service.listMovements({
        ...base,
        occurredFrom: "2000-01-01T00:00:00.000Z",
        occurredTo: "2100-01-01T00:00:00.000Z",
      });
      expect(inRange).toHaveLength(3);

      const outOfRange = await service.listMovements({
        ...base,
        occurredFrom: "2100-01-01T00:00:00.000Z",
      });
      expect(outOfRange).toEqual([]);

      const descending = await service.listMovements({ ...base, order: "desc" });
      expect(descending).toHaveLength(3);
      expect(descending[0]?.documentNo).toBe(second.documentNo);
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
