import {
  createDocumentService,
  createInventoryQueryService,
  createPostingService,
  createPurchaseInboundPostingHandler,
  createTransferPostingHandler,
} from "@erp-project/kernel";
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
import { createTransferInTransitRepository } from "../src/features/transfer/repository.js";

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const createFixture = async () => {
  const connection = createDatabase(e2eDatabaseUrl());
  const documentRepository = createDocumentRepository(connection.db);
  const ledgerRepository = createStockLedgerRepository(connection.db);
  const inTransitRepository = createTransferInTransitRepository(connection.db);
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
      createTransferPostingHandler(ledgerRepository, inTransitRepository),
    ],
    runner,
  });
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-TRF-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const sourceWarehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-TRF-WH-SRC"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(sourceWarehouse);
  const targetWarehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-TRF-WH-TGT"),
    name: "杭州分仓",
    purpose: null,
  };
  await warehouseRepository.insert(targetWarehouse);
  const item = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-TRF-SKU"),
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  };
  await itemRepository.insert(item);
  const inboundInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
    type: "PURCHASE_INBOUND",
    supplierId: supplier.id,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: sourceWarehouse.id,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity: "10", unitPrice: "2.5", amount: null }],
    ...overrides,
  });
  const transferInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
    type: "TRANSFER",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: sourceWarehouse.id,
    targetWarehouseId: targetWarehouse.id,
    warehouseId: null,
    lines: [{ itemId: item.id, quantity: "4", unitPrice: "2.5", amount: null }],
    ...overrides,
  });
  return {
    connection,
    documentService,
    inTransitRepository,
    item,
    ledgerRepository,
    postingService,
    sourceWarehouse,
    targetWarehouse,
    inboundInput,
    transferInput,
  };
};

describe("端到端：调拨与在途（Postgres 适配器）", () => {
  it("调出过账后在途记录落库，数量与在途成本都是十进制文本，没有退化成二进制浮点", async () => {
    const fixture = await createFixture();
    try {
      const inbound = await fixture.documentService.create(fixture.inboundInput());
      await fixture.postingService.post(inbound.id);
      const document = await fixture.documentService.create(fixture.transferInput());

      await fixture.postingService.post(document.id, undefined, "OUT");

      const records = await fixture.inTransitRepository.listByDocument(document.id);
      expect(records).toHaveLength(1);
      expect(typeof records[0]?.quantity).toBe("string");
      expect(typeof records[0]?.unitCost).toBe("string");
      expect(records[0]?.quantity).toBe("4.000");
      expect(records[0]?.unitCost).toBe("2.500000");
      expect(records[0]?.status).toBe("IN_TRANSIT");

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.sourceWarehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("6.000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.amount).toBe("10.00");
      expect(entries[0]?.unitPrice).toBe("2.500000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("库存查询的在途口径读的是真实在途：按调出仓查到这批在途，按目标仓查不到", async () => {
    const fixture = await createFixture();
    try {
      const inbound = await fixture.documentService.create(fixture.inboundInput());
      await fixture.postingService.post(inbound.id);
      const document = await fixture.documentService.create(fixture.transferInput());
      await fixture.postingService.post(document.id, undefined, "OUT");

      const service = createInventoryQueryService(fixture.ledgerRepository, {
        inTransit: fixture.inTransitRepository,
      });
      const sourceBalances = await service.listBalances({
        warehouseId: fixture.sourceWarehouse.id,
        itemId: fixture.item.id,
      });
      const targetBalances = await service.listBalances({
        warehouseId: fixture.targetWarehouse.id,
        itemId: fixture.item.id,
      });

      expect(sourceBalances[0]?.onHand).toBe("6.000");
      expect(sourceBalances[0]?.inTransit).toBe("4.000");
      expect(targetBalances).toEqual([]);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("调入过账后在途记录归零，目标仓账面增加这批数量", async () => {
    const fixture = await createFixture();
    try {
      const inbound = await fixture.documentService.create(fixture.inboundInput());
      await fixture.postingService.post(inbound.id);
      const document = await fixture.documentService.create(fixture.transferInput());
      await fixture.postingService.post(document.id, undefined, "OUT");

      await fixture.postingService.post(document.id, undefined, "IN");

      const records = await fixture.inTransitRepository.listByDocument(document.id);
      expect(records[0]?.quantity).toBe("0.000");
      expect(records[0]?.status).toBe("RECEIVED");
      const balance = await fixture.ledgerRepository.findBalance(
        fixture.targetWarehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("4.000");
      expect(balance?.unitCost).toBe("2.500000");
      const service = createInventoryQueryService(fixture.ledgerRepository, {
        inTransit: fixture.inTransitRepository,
      });
      const balances = await service.listBalances({
        warehouseId: fixture.sourceWarehouse.id,
        itemId: fixture.item.id,
      });
      expect(balances[0]?.inTransit).toBe("0.000");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("作废两段都过账的调拨单后，源仓恢复、目标仓扣回、在途记录被清理，流水追加两条反向流水", async () => {
    const fixture = await createFixture();
    try {
      const inbound = await fixture.documentService.create(fixture.inboundInput());
      await fixture.postingService.post(inbound.id);
      const document = await fixture.documentService.create(fixture.transferInput());
      await fixture.postingService.post(document.id, undefined, "OUT");
      await fixture.postingService.post(document.id, undefined, "IN");

      await fixture.postingService.void(document.id);

      expect(await fixture.inTransitRepository.listByDocument(document.id)).toEqual([]);
      const sourceBalance = await fixture.ledgerRepository.findBalance(
        fixture.sourceWarehouse.id,
        fixture.item.id,
      );
      const targetBalance = await fixture.ledgerRepository.findBalance(
        fixture.targetWarehouse.id,
        fixture.item.id,
      );
      expect(sourceBalance?.quantity).toBe("10.000");
      expect(targetBalance?.quantity).toBe("0.000");
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toHaveLength(4);
      expect(entries.filter((entry) => entry.direction === "REVERSAL")).toHaveLength(2);
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("调出过账失败时整单回滚：源仓库存、在途记录与流水都不留下", async () => {
    const fixture = await createFixture();
    try {
      const inbound = await fixture.documentService.create(
        fixture.inboundInput({
          lines: [{ itemId: fixture.item.id, quantity: "3", unitPrice: "2.5", amount: null }],
        }),
      );
      await fixture.postingService.post(inbound.id);
      const document = await fixture.documentService.create(fixture.transferInput());

      await expect(fixture.postingService.post(document.id, undefined, "OUT")).rejects.toThrow(
        "禁止负库存",
      );

      const balance = await fixture.ledgerRepository.findBalance(
        fixture.sourceWarehouse.id,
        fixture.item.id,
      );
      expect(balance?.quantity).toBe("3.000");
      expect(await fixture.inTransitRepository.listByDocument(document.id)).toEqual([]);
      const entries = await fixture.ledgerRepository.listEntriesByDocumentNo(document.documentNo);
      expect(entries).toEqual([]);
      expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
    } finally {
      await fixture.connection.pool.end();
    }
  });

  it("未调出过账就调入过账被拒绝，错误消息指出该调拨单尚未调出", async () => {
    const fixture = await createFixture();
    try {
      const document = await fixture.documentService.create(fixture.transferInput());

      await expect(fixture.postingService.post(document.id, undefined, "IN")).rejects.toThrow(
        "尚未调出",
      );

      expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
    } finally {
      await fixture.connection.pool.end();
    }
  });
});
