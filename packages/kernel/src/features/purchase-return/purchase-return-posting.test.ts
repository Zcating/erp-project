import { describe, expect, it } from "vitest";
import { StockNegativeError, ValidationError } from "../../shared/errors";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { Document, DocumentInput } from "../documents/model";
import { createDocumentService } from "../documents/service";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository";
import { createItemMasterService } from "../item-master/service";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
import { createPostingService } from "../posting/service";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting";
import { createSaleOutboundPostingHandler } from "../selling/sale-outbound-posting";
import { createPurchaseReturnPostingHandler } from "./purchase-return-posting";

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
      createPurchaseReturnPostingHandler(ledger, documents),
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
  quantity: string,
  unitPriceText: string,
  overrides: Partial<DocumentInput> = {},
): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice: unitPriceText, amount: null }],
  ...overrides,
});

const saleOutboundInput = (itemId: string, quantity: string): DocumentInput => ({
  type: "SALE_OUTBOUND",
  supplierId: null,
  customerId: "customer-1",
  sourceWarehouseId: "warehouse-1",
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice: "3.5", amount: null }],
});

const purchaseReturnInput = (
  originalLineId: string,
  quantity: string,
  overrides: Partial<DocumentInput> = {},
): DocumentInput => ({
  type: "PURCHASE_RETURN",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [
    {
      itemId: "ignored-item-id",
      quantity,
      unitPrice: null,
      amount: null,
      originalLineId,
    },
  ],
  ...overrides,
});

const seedInbound = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  quantity = "10",
  unitPriceText = "2",
): Promise<Document> => {
  const inbound = await fixture.documentService.create(
    purchaseInboundInput(fixture.item.id, quantity, unitPriceText),
  );
  await fixture.postingService.post(inbound.id);
  return inbound;
};

const originalLineIdOf = (document: Document): string => {
  const lineId = document.lines[0]?.id;
  if (lineId === undefined) {
    throw new Error("原单据没有单据行");
  }
  return lineId;
};

describe("采购退货草稿的引用与仓库", () => {
  it("退货行必须给出原采购入库行引用，缺失时保存失败并指出缺少原单据行引用", async () => {
    const fixture = await createFixture();

    await expect(fixture.documentService.create(purchaseReturnInput("", "1"))).rejects.toThrow(
      "第 1 行缺少原单据行引用",
    );
  });

  it("引用一张不存在的单据行时保存失败，错误消息指出原单据行不存在", async () => {
    const fixture = await createFixture();

    await expect(
      fixture.documentService.create(purchaseReturnInput("missing-line-id", "1")),
    ).rejects.toThrow("第 1 行引用的原单据行不存在：missing-line-id");
  });

  it("引用属于销售出库单的行时保存失败，错误消息指出原单据行不属于采购入库单", async () => {
    const fixture = await createFixture();
    const inbound = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "10", "2"),
    );
    await fixture.postingService.post(inbound.id);
    const outbound = await fixture.documentService.create(saleOutboundInput(fixture.item.id, "2"));
    await fixture.postingService.post(outbound.id);

    await expect(
      fixture.documentService.create(purchaseReturnInput(originalLineIdOf(outbound), "1")),
    ).rejects.toThrow("第 1 行引用的原单据行不属于采购入库单");
  });

  it("引用尚未过账的采购入库行时保存失败，错误消息指出原单据行尚未过账", async () => {
    const fixture = await createFixture();
    const inbound = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "10", "2"),
    );

    await expect(
      fixture.documentService.create(purchaseReturnInput(originalLineIdOf(inbound), "1")),
    ).rejects.toThrow("第 1 行引用的原单据行尚未过账");
  });

  it("退货单的仓库自动取原采购入库单的目标仓，保存后单据上的仓库与原单一致", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);

    const created = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "2"),
    );

    expect(created.sourceWarehouseId).toBe("warehouse-1");
    expect(created.type).toBe("PURCHASE_RETURN");
  });

  it("提交与原单不同的仓库值时保存失败，错误消息指出仓库必须取自原单据", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);

    await expect(
      fixture.documentService.create(
        purchaseReturnInput(originalLineIdOf(inbound), "2", { sourceWarehouseId: "warehouse-2" }),
      ),
    ).rejects.toThrow("退货单的仓库必须取自原单据的目标仓：warehouse-1");
  });

  it("提交挂在目标仓字段上的不同仓库值时同样保存失败，仓库只能取自原单据", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);

    await expect(
      fixture.documentService.create(
        purchaseReturnInput(originalLineIdOf(inbound), "2", { targetWarehouseId: "warehouse-2" }),
      ),
    ).rejects.toThrow("退货单的仓库必须取自原单据的目标仓：warehouse-1");
  });

  it("退货行的商品取自原单据行，不采信调用方自己填的商品", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);

    const created = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "2"),
    );

    expect(created.lines[0]?.itemId).toBe(fixture.item.id);
    expect(created.lines[0]?.originalLineId).toBe(originalLineIdOf(inbound));
    expect(created.lines[0]?.quantity).toBe("2.000");
  });
});

describe("采购退货过账的库存与成本结转", () => {
  it("过账后目标仓该商品的账面库存减少退货数量", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "4"),
    );

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("6.000");
  });

  it("结转成本按过账当时的加权平均成本计算：原入库 10 瓶、进价 2.00，退货 4 瓶结转成本为 8.00", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "4"),
    );

    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount).toBe("8.00");
    expect(entries[0]?.unitPrice).toBe("2.000000");
    expect(entries[0]?.direction).toBe("POST");
    expect(entries[0]?.quantityBefore).toBe("10.000");
    expect(entries[0]?.quantityAfter).toBe("6.000");
  });

  it("结转成本取过账当时的当前加权平均成本，不是原入库行的进价：再入库一批后加权成本变成 2.50，退货 4 瓶结转 10.00", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture, "10", "2");
    const second = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "10", "3"),
    );
    await fixture.postingService.post(second.id);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "4"),
    );

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.unitCost).toBe("2.500000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.unitPrice).toBe("2.500000");
    expect(entries[0]?.amount).toBe("10.00");
  });

  it("结转金额与结转成本单价都是十进制文本，没有退化成二进制浮点", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "4"),
    );

    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(typeof entries[0]?.amount).toBe("string");
    expect(typeof entries[0]?.unitPrice).toBe("string");
    expect(typeof entries[0]?.quantityBefore).toBe("string");
  });

  it("累计退货数量正好等于该行已过账数量时过账成功", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "10"),
    );

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("0.000");
  });

  it("累计退货数量超过原行已过账数量时过账失败并报出超退的数量，库存与流水都不变化", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const originalLineId = originalLineIdOf(inbound);

    const first = await fixture.documentService.create(purchaseReturnInput(originalLineId, "6"));
    await fixture.postingService.post(first.id);
    const second = await fixture.documentService.create(purchaseReturnInput(originalLineId, "3"));
    await fixture.postingService.post(second.id);
    const third = await fixture.documentService.create(purchaseReturnInput(originalLineId, "2"));

    const failure = await fixture.postingService.post(third.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).message).toContain("超退 1.000");
    expect((failure as ValidationError).message).toContain("累计退货 11.000");
    expect((failure as ValidationError).message).toContain("已过账数量 10.000");
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("1.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(third.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(third.id)).status).toBe("DRAFT");
  });

  it("同一张退货单里两行引用同一原单行时累计计算，超退按两行合计报出", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const originalLineId = originalLineIdOf(inbound);

    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineId, "6", {
        lines: [
          {
            itemId: "ignored-item-id",
            quantity: "6",
            unitPrice: null,
            amount: null,
            originalLineId,
          },
          {
            itemId: "ignored-item-id",
            quantity: "6",
            unitPrice: null,
            amount: null,
            originalLineId,
          },
        ],
      }),
    );

    const failure = await fixture.postingService.post(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).message).toContain("超退 2.000");
    expect((failure as ValidationError).message).toContain("累计退货 12.000");
  });

  it("退货会让账面库存变负时整单过账失败，库存与库存流水都不发生变化", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const outbound = await fixture.documentService.create(saleOutboundInput(fixture.item.id, "7"));
    await fixture.postingService.post(outbound.id);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "4"),
    );

    const failure = await fixture.postingService.post(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    expect((failure as StockNegativeError).code).toBe("STOCK_NEGATIVE");
    expect((failure as StockNegativeError).message).toContain("禁止负库存");
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("3.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });

  it("含两行、其中一行会导致账面库存为负时整单失败，第一行对应的库存与流水都没有写入", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const outbound = await fixture.documentService.create(saleOutboundInput(fixture.item.id, "8"));
    await fixture.postingService.post(outbound.id);
    const originalLineId = originalLineIdOf(inbound);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineId, "1", {
        lines: [
          {
            itemId: "ignored-item-id",
            quantity: "1",
            unitPrice: null,
            amount: null,
            originalLineId,
          },
          {
            itemId: "ignored-item-id",
            quantity: "4",
            unitPrice: null,
            amount: null,
            originalLineId,
          },
        ],
      }),
    );

    const failure = await fixture.postingService.post(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("2.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });

  it("原采购入库单被作废后，引用它的退货单过账失败，错误消息指出原单据行尚未过账", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "2"),
    );
    await fixture.postingService.void(inbound.id);

    await expect(fixture.postingService.post(document.id)).rejects.toThrow(
      "引用的原单据行尚未过账",
    );
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("0.000");
  });
});

describe("采购退货作废的回退", () => {
  it("已过账的采购退货单作废后，目标仓账面库存回补、加权平均成本按本次结转金额回退，并新增一条反向流水", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineIdOf(inbound), "4"),
    );
    await fixture.postingService.post(document.id);

    await fixture.postingService.void(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("10.000");
    expect(balance?.unitCost).toBe("2.000000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.direction).toBe("POST");
    expect(entries[1]).toMatchObject({
      direction: "REVERSAL",
      lineNo: 1,
      quantityBefore: "6.000",
      quantityAfter: "10.000",
      costBefore: "2.000000",
      costAfter: "2.000000",
      unitPrice: "2.000000",
      amount: "-8.00",
    });
  });

  it("作废后的退货不再占用原单行的可退数量，可以重新退同一行", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const originalLineId = originalLineIdOf(inbound);

    const voided = await fixture.documentService.create(purchaseReturnInput(originalLineId, "10"));
    await fixture.postingService.post(voided.id);
    await fixture.postingService.void(voided.id);

    const document = await fixture.documentService.create(
      purchaseReturnInput(originalLineId, "10"),
    );
    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.amount).toBe("20.00");
  });
});
