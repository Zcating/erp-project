import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  amount,
  quantity,
  toFixedString,
} from "@erp-inventory-sales/shared";
import { describe, expect, it } from "vitest";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { Document, DocumentInput } from "../documents/model";
import { createDocumentService } from "../documents/service";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository";
import { createItemMasterService } from "../item-master/service";
import { createPurchaseReturnPostingHandler } from "../purchase-return/purchase-return-posting";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting";
import { createSaleReturnPostingHandler } from "../sales-return/sale-return-posting";
import { createSaleOutboundPostingHandler } from "../selling/sale-outbound-posting";
import { createStocktakePostingHandler } from "../stocktake/stocktake-posting";
import { createInMemoryTransferInTransitRepository } from "../transfer/in-memory-repository";
import { TRANSFER_POSTING_PHASES } from "../transfer/model";
import { createTransferPostingHandler } from "../transfer/posting";
import { createPostingService } from "../posting/service";
import { createInMemoryStockLedgerRepository } from "./in-memory-repository";
import type { StockLedgerRepository } from "./ports";

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const WAREHOUSE = "warehouse-1";
const TARGET_WAREHOUSE = "warehouse-2";

const createFixture = async () => {
  const documents = createInMemoryDocumentRepository();
  const ledger = createInMemoryStockLedgerRepository();
  const inTransit = createInMemoryTransferInTransitRepository();
  const items = createInMemoryItemMasterRepository();
  const itemService = createItemMasterService(items);
  let counter = 0;
  const documentService = createDocumentService(documents, {
    idGenerator: () => `doc-${++counter}`,
    clock: () => FIXED_CLOCK,
    timeZone: "Asia/Shanghai",
    itemLookup: items,
  });
  const postingService = createPostingService({
    documents,
    ledger,
    handlers: [
      createPurchaseInboundPostingHandler(ledger),
      createSaleOutboundPostingHandler(ledger),
      createSaleReturnPostingHandler(ledger, documents),
      createPurchaseReturnPostingHandler(ledger, documents),
      createStocktakePostingHandler(ledger),
      createTransferPostingHandler(ledger, inTransit),
    ],
  });
  const item = await itemService.create({
    code: "SKU-001",
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  });
  return { documentService, inTransit, ledger, postingService, item };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

type LedgerNet = {
  warehouseId: string;
  itemId: string;
  quantity: string;
  amount: string;
};

const netOfDocument = async (
  ledger: StockLedgerRepository,
  documentId: string,
): Promise<LedgerNet[]> => {
  const entries = await ledger.listEntriesByDocument(documentId);
  const groups = new Map<string, LedgerNet>();
  for (const entry of entries) {
    const key = `${entry.warehouseId}::${entry.itemId}`;
    const group = groups.get(key) ?? {
      warehouseId: entry.warehouseId,
      itemId: entry.itemId,
      quantity: "0.000",
      amount: "0.00",
    };
    const delta = quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore));
    group.quantity = toFixedString(quantity(group.quantity).plus(delta), QUANTITY_SCALE);
    group.amount = toFixedString(amount(group.amount).plus(amount(entry.amount)), AMOUNT_SCALE);
    groups.set(key, group);
  }
  return [...groups.values()];
};

const expectNetZero = (nets: LedgerNet[]): void => {
  for (const net of nets) {
    expect(quantity(net.quantity).isZero()).toBe(true);
    expect(amount(net.amount).isZero()).toBe(true);
  }
};

const expectLedgerMatchesLastMovement = async (ledger: StockLedgerRepository): Promise<void> => {
  const movements = await ledger.listMovements({
    documentNo: null,
    warehouseId: null,
    itemId: null,
    lineNo: null,
    occurredFrom: null,
    occurredTo: null,
    order: "asc",
  });
  const lastQuantityByKey = new Map<string, string>();
  for (const movement of movements) {
    lastQuantityByKey.set(`${movement.warehouseId}::${movement.itemId}`, movement.quantityAfter);
  }
  const balances = await ledger.listBalances(null, null);
  for (const balance of balances) {
    const key = `${balance.warehouseId}::${balance.itemId}`;
    expect(balance.quantity).toBe(lastQuantityByKey.get(key) ?? "0.000");
  }
  for (const key of lastQuantityByKey.keys()) {
    expect(balances.some((balance) => `${balance.warehouseId}::${balance.itemId}` === key)).toBe(
      true,
    );
  }
};

const expectNoNegativeStock = async (ledger: StockLedgerRepository): Promise<void> => {
  for (const balance of await ledger.listBalances(null, null)) {
    expect(quantity(balance.quantity).isNegative()).toBe(false);
  }
};

const expectLedgerInvariants = async (
  ledger: StockLedgerRepository,
  document: Document,
): Promise<LedgerNet[]> => {
  const nets = await netOfDocument(ledger, document.id);
  expectNetZero(nets);
  await expectLedgerMatchesLastMovement(ledger);
  await expectNoNegativeStock(ledger);
  return nets;
};

const purchaseInboundInput = (
  itemId: string,
  quantity: string,
  unitPrice: string,
): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: WAREHOUSE,
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice, amount: null }],
});

const saleOutboundInput = (itemId: string, quantity: string): DocumentInput => ({
  type: "SALE_OUTBOUND",
  supplierId: null,
  customerId: "customer-1",
  sourceWarehouseId: WAREHOUSE,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice: "3.5", amount: null }],
});

const saleReturnInput = (originalLineId: string, quantity: string): DocumentInput => ({
  type: "SALE_RETURN",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId: "ignored", quantity, unitPrice: null, amount: null, originalLineId }],
});

const purchaseReturnInput = (originalLineId: string, quantity: string): DocumentInput => ({
  type: "PURCHASE_RETURN",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId: "ignored", quantity, unitPrice: null, amount: null, originalLineId }],
});

const stocktakeInput = (itemId: string, quantity: string): DocumentInput => ({
  type: "STOCKTAKE",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: WAREHOUSE,
  lines: [{ itemId, quantity, unitPrice: null, amount: null }],
});

const transferInput = (itemId: string, quantity: string): DocumentInput => ({
  type: "TRANSFER",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: WAREHOUSE,
  targetWarehouseId: TARGET_WAREHOUSE,
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice: "2.5", amount: null }],
});

const lineIdOf = (document: Document): string => {
  const lineId = document.lines[0]?.id;
  if (lineId === undefined) {
    throw new Error(`单据 ${document.documentNo} 没有单据行`);
  }
  return lineId;
};

const seedStock = async (fixture: Fixture, quantity = "10", unitPrice = "2"): Promise<Document> => {
  const inbound = await fixture.documentService.create(
    purchaseInboundInput(fixture.item.id, quantity, unitPrice),
  );
  await fixture.postingService.post(inbound.id);
  return inbound;
};

describe("库存账本恒等式在六类单据的过账与作废序列上成立", () => {
  it("采购入库单：作废后该单据对每个（仓库, 商品）的数量净额与金额净额为零", async () => {
    const fixture = await createFixture();
    const document = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "10", "2"),
    );
    await fixture.postingService.post(document.id);
    await fixture.postingService.void(document.id);

    const nets = await expectLedgerInvariants(fixture.ledger, document);

    expect(nets).toHaveLength(1);
    expect(nets[0]).toMatchObject({ warehouseId: WAREHOUSE, itemId: fixture.item.id });
  });

  it("销售出库单：作废后该单据对每个（仓库, 商品）的数量净额与金额净额为零", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id, "5"));
    await fixture.postingService.post(document.id);
    await fixture.postingService.void(document.id);

    const nets = await expectLedgerInvariants(fixture.ledger, document);

    expect(nets).toHaveLength(1);
    expect(nets[0]).toMatchObject({ warehouseId: WAREHOUSE, itemId: fixture.item.id });
  });

  it("销售退货单：作废后该单据对每个（仓库, 商品）的数量净额与金额净额为零", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const saleOutbound = await fixture.documentService.create(
      saleOutboundInput(fixture.item.id, "5"),
    );
    await fixture.postingService.post(saleOutbound.id);
    const document = await fixture.documentService.create(
      saleReturnInput(lineIdOf(saleOutbound), "2"),
    );
    await fixture.postingService.post(document.id);
    await fixture.postingService.void(document.id);

    const nets = await expectLedgerInvariants(fixture.ledger, document);

    expect(nets).toHaveLength(1);
    expect(nets[0]).toMatchObject({ warehouseId: WAREHOUSE, itemId: fixture.item.id });
  });

  it("采购退货单：作废后该单据对每个（仓库, 商品）的数量净额与金额净额为零", async () => {
    const fixture = await createFixture();
    const inbound = await seedStock(fixture);
    const document = await fixture.documentService.create(
      purchaseReturnInput(lineIdOf(inbound), "2"),
    );
    await fixture.postingService.post(document.id);
    await fixture.postingService.void(document.id);

    const nets = await expectLedgerInvariants(fixture.ledger, document);

    expect(nets).toHaveLength(1);
    expect(nets[0]).toMatchObject({ warehouseId: WAREHOUSE, itemId: fixture.item.id });
  });

  it("盘点单：作废后该单据对每个（仓库, 商品）的数量净额与金额净额为零", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(stocktakeInput(fixture.item.id, "12"));
    await fixture.postingService.post(document.id);
    await fixture.postingService.void(document.id);

    const nets = await expectLedgerInvariants(fixture.ledger, document);

    expect(nets).toHaveLength(1);
    expect(nets[0]).toMatchObject({ warehouseId: WAREHOUSE, itemId: fixture.item.id });
  });

  it("调拨单：调出与调入都过账后作废，调出腿与调入腿各自的数量净额与金额净额为零", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(transferInput(fixture.item.id, "4"));
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.OUT);
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.IN);
    await fixture.postingService.void(document.id);

    const nets = await expectLedgerInvariants(fixture.ledger, document);

    expect(nets).toHaveLength(2);
    expect(nets.map((net) => net.warehouseId).sort()).toEqual([WAREHOUSE, TARGET_WAREHOUSE]);
  });

  it("调拨单作废时先冲调出腿再冲调入腿", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(transferInput(fixture.item.id, "4"));
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.OUT);
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.IN);
    await fixture.postingService.void(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    const reversals = entries.filter((entry) => entry.direction === "REVERSAL");

    expect(reversals.map((entry) => entry.warehouseId)).toEqual([WAREHOUSE, TARGET_WAREHOUSE]);
    expect(reversals.map((entry) => entry.quantityAfter)).toEqual(["10.000", "0.000"]);
  });

  it("「最后一条流水」以流水序号为准：升序流水列表与按单据取流水的顺序一致", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(transferInput(fixture.item.id, "4"));
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.OUT);
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.IN);
    await fixture.postingService.void(document.id);

    const movements = await fixture.ledger.listMovements({
      documentNo: null,
      warehouseId: null,
      itemId: null,
      lineNo: null,
      occurredFrom: null,
      occurredTo: null,
      order: "asc",
    });
    const entriesByDocument = await fixture.ledger.listEntriesByDocument(document.id);
    const movementsOfDocument = movements.filter((movement) => movement.documentId === document.id);

    expect(movementsOfDocument.map((movement) => movement.quantityAfter)).toEqual(
      entriesByDocument.map((entry) => entry.quantityAfter),
    );
    expect(movements[movements.length - 1]?.quantityAfter).toBe("0.000");
    expect((await fixture.ledger.findBalance(TARGET_WAREHOUSE, fixture.item.id))?.quantity).toBe(
      "0.000",
    );
    expect((await fixture.ledger.findBalance(WAREHOUSE, fixture.item.id))?.quantity).toBe("10.000");
  });
});

describe("库存账本恒等式抓不住跨单据的语义缺陷", () => {
  it("原单据被已过账退货单引用时，无论原单据能否作废，冲销净额、台账与流水一致性、无负库存三条恒等式都成立", async () => {
    const fixture = await createFixture();
    const firstInbound = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "10", "1"),
    );
    await fixture.postingService.post(firstInbound.id);
    await fixture.postingService.void(firstInbound.id);

    const inbound = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "10", "1"),
    );
    await fixture.postingService.post(inbound.id);
    const outbound = await fixture.documentService.create(saleOutboundInput(fixture.item.id, "10"));
    await fixture.postingService.post(outbound.id);
    const saleReturn = await fixture.documentService.create(
      saleReturnInput(lineIdOf(outbound), "10"),
    );
    await fixture.postingService.post(saleReturn.id);

    await fixture.postingService.void(outbound.id).catch(() => undefined);

    const voidedDocuments = (await fixture.documentService.list()).filter(
      (document) => document.status === "VOIDED",
    );
    expect(voidedDocuments.length).toBeGreaterThan(0);
    for (const document of voidedDocuments) {
      expectNetZero(await netOfDocument(fixture.ledger, document.id));
    }
    await expectLedgerMatchesLastMovement(fixture.ledger);
    await expectNoNegativeStock(fixture.ledger);
  });
});
