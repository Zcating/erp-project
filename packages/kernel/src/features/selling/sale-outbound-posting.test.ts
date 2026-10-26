import { describe, expect, it } from "vitest";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository.js";
import type { DocumentInput } from "../documents/model.js";
import { createDocumentService } from "../documents/service.js";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository.js";
import { createItemMasterService } from "../item-master/service.js";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository.js";
import { createPostingService } from "../posting/service.js";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting.js";
import { StockNegativeError } from "../../shared/errors/index.js";
import { createSaleOutboundPostingHandler } from "./sale-outbound-posting.js";

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const createFixture = async () => {
  const documents = createInMemoryDocumentRepository();
  const ledger = createInMemoryStockLedgerRepository();
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
  return { documents, ledger, documentService, postingService, item };
};

const purchaseInboundInput = (
  itemId: string,
  overrides: Partial<DocumentInput> = {},
): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId, quantity: "12", unitPrice: "2", amount: null }],
  ...overrides,
});

const saleOutboundInput = (
  itemId: string,
  overrides: Partial<DocumentInput> = {},
): DocumentInput => ({
  type: "SALE_OUTBOUND",
  supplierId: null,
  customerId: "customer-1",
  sourceWarehouseId: "warehouse-1",
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId, quantity: "5", unitPrice: "3.5", amount: null }],
  ...overrides,
});

const seedStock = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  quantityText = "12",
  unitPriceText = "2",
): Promise<void> => {
  const inbound = await fixture.documentService.create(
    purchaseInboundInput(fixture.item.id, {
      lines: [
        { itemId: fixture.item.id, quantity: quantityText, unitPrice: unitPriceText, amount: null },
      ],
    }),
  );
  await fixture.postingService.post(inbound.id);
};

describe("销售出库过账的库存影响", () => {
  it("过账后来源仓该商品的账面库存减少该行数量", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id));

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("7.000");
  });

  it("先入库 12 瓶、进价 2.00，再出库 5 瓶，账面库存剩 7 瓶、结转成本为 10.00", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id));

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("7.000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount).toBe("10.00");
  });

  it("结转成本按过账前的加权平均成本计算，单据行上的售价不参与结转", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id));

    await fixture.postingService.post(document.id);

    expect(document.lines[0]?.unitPrice).toBe("3.500000");
    expect(document.lines[0]?.amount).toBe("17.50");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.unitPrice).toBe("2.000000");
    expect(entries[0]?.amount).toBe("10.00");
    expect(entries[0]?.amount).not.toBe("17.50");
  });

  it("结转金额按金额精度四舍五入（half-up），尾差按半进位处理", async () => {
    const fixture = await createFixture();
    await seedStock(fixture, "4", "0.25");
    const document = await fixture.documentService.create(
      saleOutboundInput(fixture.item.id, {
        lines: [{ itemId: fixture.item.id, quantity: "0.5", unitPrice: "3.5", amount: null }],
      }),
    );

    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.amount).toBe("0.13");
  });

  it("出库过账后该商品在该仓的加权平均成本保持不变，不因出库被重算", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id));

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.unitCost).toBe("2.000000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.costBefore).toBe("2.000000");
    expect(entries[0]?.costAfter).toBe("2.000000");
  });

  it("过账生成的库存流水记录该行的变动前后数量、变动前后成本、结转成本单价与结转金额", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id));

    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]).toMatchObject({
      documentNo: document.documentNo,
      lineNo: 1,
      warehouseId: "warehouse-1",
      itemId: fixture.item.id,
      direction: "POST",
      quantityBefore: "12.000",
      quantityAfter: "7.000",
      costBefore: "2.000000",
      costAfter: "2.000000",
      unitPrice: "2.000000",
      amount: "10.00",
    });
  });

  it("出库数量正好等于账面库存时过账成功，账面库存变为 0，不会被负库存规则拦下", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(
      saleOutboundInput(fixture.item.id, {
        lines: [{ itemId: fixture.item.id, quantity: "12", unitPrice: "3.5", amount: null }],
      }),
    );

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("0.000");
  });

  it("库存不足时整张销售出库单过账失败，失败后库存数量与库存流水都不发生变化", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(
      saleOutboundInput(fixture.item.id, {
        lines: [{ itemId: fixture.item.id, quantity: "13", unitPrice: "3.5", amount: null }],
      }),
    );

    const failure = await fixture.postingService.post(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    expect((failure as StockNegativeError).code).toBe("STOCK_NEGATIVE");
    expect((failure as StockNegativeError).message).toContain("禁止负库存");
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });

  it("含两行、其中一行会导致账面库存为负时整单失败，第一行对应的库存与流水都没有写入", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(
      saleOutboundInput(fixture.item.id, {
        lines: [
          { itemId: fixture.item.id, quantity: "5", unitPrice: "3.5", amount: null },
          { itemId: fixture.item.id, quantity: "10", unitPrice: "3.5", amount: null },
        ],
      }),
    );

    const failure = await fixture.postingService.post(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });

  it("已过账的销售出库单作废后，账面库存回到出库前，成本按原结转额回冲，并新增一条数量相反的反向流水", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id));
    await fixture.postingService.post(document.id);

    await fixture.postingService.void(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(balance?.unitCost).toBe("2.000000");

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.direction).toBe("POST");
    expect(entries[1]).toMatchObject({
      direction: "REVERSAL",
      lineNo: 1,
      quantityBefore: "7.000",
      quantityAfter: "12.000",
      costBefore: "2.000000",
      costAfter: "2.000000",
      unitPrice: "2.000000",
      amount: "-10.00",
    });
  });

  it("作废保留原流水与原单据，不做物理删除", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id));
    await fixture.postingService.post(document.id);

    const voided = await fixture.postingService.void(document.id);

    expect(voided.status).toBe("VOIDED");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toHaveLength(2);
    expect(await fixture.documentService.get(document.id)).toBeDefined();
  });

  it("作废按原结转额回冲，不按当前均价重算：入库 12@2 → 出库 5 → 入库 12@4 → 作废后账面 24、均价 3.00、反向流水 -10.00", async () => {
    const fixture = await createFixture();
    await seedStock(fixture);
    const document = await fixture.documentService.create(saleOutboundInput(fixture.item.id));
    await fixture.postingService.post(document.id);
    const repriced = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, {
        lines: [{ itemId: fixture.item.id, quantity: "12", unitPrice: "4", amount: null }],
      }),
    );
    await fixture.postingService.post(repriced.id);

    await fixture.postingService.void(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("24.000");
    expect(balance?.unitCost).toBe("3.000000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      direction: "REVERSAL",
      unitPrice: "2.000000",
      amount: "-10.00",
    });
  });
});
