import {
  AMOUNT_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-inventory-sales/shared";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/errors/index.js";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository.js";
import type { Document, DocumentInput } from "../documents/model.js";
import { createDocumentService } from "../documents/service.js";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository.js";
import { createItemMasterService } from "../item-master/service.js";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository.js";
import { createPostingService } from "../posting/service.js";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting.js";
import { createSaleOutboundPostingHandler } from "../selling/sale-outbound-posting.js";
import { createSaleReturnPostingHandler } from "./sale-return-posting.js";

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
      createSaleReturnPostingHandler(ledger, documents),
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
): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice: unitPriceText, amount: null }],
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

const saleReturnInput = (
  originalLineId: string,
  quantity: string,
  overrides: Partial<DocumentInput> = {},
): DocumentInput => ({
  type: "SALE_RETURN",
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

const seedOutbound = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  inboundQuantity = "12",
  inboundUnitPrice = "2",
  outboundQuantity = "5",
): Promise<Document> => {
  const inbound = await fixture.documentService.create(
    purchaseInboundInput(fixture.item.id, inboundQuantity, inboundUnitPrice),
  );
  await fixture.postingService.post(inbound.id);
  const outbound = await fixture.documentService.create(
    saleOutboundInput(fixture.item.id, outboundQuantity),
  );
  await fixture.postingService.post(outbound.id);
  return outbound;
};

const originalLineIdOf = (document: Document): string => {
  const lineId = document.lines[0]?.id;
  if (lineId === undefined) {
    throw new Error("原单据没有单据行");
  }
  return lineId;
};

describe("销售退货草稿的引用与仓库", () => {
  it("退货行必须给出原单据行引用，缺失时保存失败并指出缺少原单据行引用", async () => {
    const fixture = await createFixture();

    await expect(fixture.documentService.create(saleReturnInput("", "1"))).rejects.toThrow(
      "第 1 行缺少原单据行引用",
    );
  });

  it("引用一张不存在的单据行时保存失败，错误消息指出原单据行不存在", async () => {
    const fixture = await createFixture();

    await expect(
      fixture.documentService.create(saleReturnInput("missing-line-id", "1")),
    ).rejects.toThrow("第 1 行引用的原单据行不存在：missing-line-id");
  });

  it("引用属于采购入库单的行时保存失败，错误消息指出原单据行不属于销售出库单", async () => {
    const fixture = await createFixture();
    const inbound = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "12", "2"),
    );

    await expect(
      fixture.documentService.create(saleReturnInput(originalLineIdOf(inbound), "1")),
    ).rejects.toThrow("第 1 行引用的原单据行不属于销售出库单");
  });

  it("引用尚未过账的销售出库行时保存失败，错误消息指出原单据行尚未过账", async () => {
    const fixture = await createFixture();
    const inbound = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "12", "2"),
    );
    await fixture.postingService.post(inbound.id);
    const outbound = await fixture.documentService.create(saleOutboundInput(fixture.item.id, "5"));

    await expect(
      fixture.documentService.create(saleReturnInput(originalLineIdOf(outbound), "1")),
    ).rejects.toThrow("第 1 行引用的原单据行尚未过账");
  });

  it("退货单的仓库自动取原销售出库单的来源仓，保存后单据上的仓库与原单一致", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);

    const created = await fixture.documentService.create(
      saleReturnInput(originalLineIdOf(outbound), "2"),
    );

    expect(created.sourceWarehouseId).toBe("warehouse-1");
    expect(created.type).toBe("SALE_RETURN");
  });

  it("提交与原单不同的仓库值时保存失败，错误消息指出仓库必须取自原单据", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);

    await expect(
      fixture.documentService.create(
        saleReturnInput(originalLineIdOf(outbound), "2", { sourceWarehouseId: "warehouse-2" }),
      ),
    ).rejects.toThrow("退货单的仓库必须取自原单据的来源仓：warehouse-1");
  });

  it("退货行的商品取自原单据行，不采信调用方自己填的商品", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);

    const created = await fixture.documentService.create(
      saleReturnInput(originalLineIdOf(outbound), "2"),
    );

    expect(created.lines[0]?.itemId).toBe(fixture.item.id);
    expect(created.lines[0]?.originalLineId).toBe(originalLineIdOf(outbound));
    expect(created.lines[0]?.quantity).toBe("2.000");
  });
});

describe("销售退货过账的库存与成本回冲", () => {
  it("过账后来源仓该商品的账面库存增加退货数量", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const document = await fixture.documentService.create(
      saleReturnInput(originalLineIdOf(outbound), "2"),
    );

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("9.000");
  });

  it("入库成本等于原出库行已结转成本按数量比例分摊的值：原出库 5 瓶、结转成本 10.00，退货 2 瓶时入库成本为 4.00", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const document = await fixture.documentService.create(
      saleReturnInput(originalLineIdOf(outbound), "2"),
    );

    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount).toBe("4.00");
    expect(entries[0]?.direction).toBe("POST");
    expect(entries[0]?.quantityBefore).toBe("7.000");
    expect(entries[0]?.quantityAfter).toBe("9.000");
  });

  it("尾差按累计分摊公式处理：原出库 3 瓶、结转成本 10.00，分三次各退 1 瓶，结转金额依次为 3.33、3.34、3.33，三次合计正好 10.00", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture, "3", "3.333333", "3");
    const originalLineId = originalLineIdOf(outbound);

    const amounts: string[] = [];
    for (const _ of [1, 2, 3]) {
      const document = await fixture.documentService.create(saleReturnInput(originalLineId, "1"));
      await fixture.postingService.post(document.id);
      const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
      amounts.push(entries[0]?.amount ?? "");
    }

    expect(amounts).toEqual(["3.33", "3.34", "3.33"]);
    let total = "0.000";
    for (const value of amounts) {
      total = toFixedString(quantity(total).plus(quantity(value)), AMOUNT_SCALE);
    }
    expect(total).toBe("10.00");
  });

  it("同一原单行的累计退货数量正好等于该行已过账数量时过账成功", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const document = await fixture.documentService.create(
      saleReturnInput(originalLineIdOf(outbound), "5"),
    );

    await fixture.postingService.post(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.amount).toBe("10.00");
  });

  it("累计退货数量超过原行已过账数量时过账失败并报出超退的数量，库存与流水都不变化", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const originalLineId = originalLineIdOf(outbound);

    const first = await fixture.documentService.create(saleReturnInput(originalLineId, "3"));
    await fixture.postingService.post(first.id);
    const second = await fixture.documentService.create(saleReturnInput(originalLineId, "2"));
    await fixture.postingService.post(second.id);
    const third = await fixture.documentService.create(saleReturnInput(originalLineId, "1"));

    const failure = await fixture.postingService.post(third.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).message).toContain("超退 1.000");
    expect((failure as ValidationError).message).toContain("累计退货 6.000");
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(third.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(third.id)).status).toBe("DRAFT");
  });

  it("退货流水的成本单价等于分摊金额除以退货数量，数量×单价舍入后等于金额", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const document = await fixture.documentService.create(
      saleReturnInput(originalLineIdOf(outbound), "2"),
    );

    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    const entry = entries[0];
    expect(entry?.unitPrice).toBe("2.000000");
    expect(typeof entry?.amount).toBe("string");
    expect(typeof entry?.unitPrice).toBe("string");
    expect(amountOf(quantity("2"), unitPrice(entry?.unitPrice ?? "0"))).toBeDefined();
    expect(
      toFixedString(amountOf(quantity("2"), unitPrice(entry?.unitPrice ?? "0")), AMOUNT_SCALE),
    ).toBe(entry?.amount);
  });

  it("原销售出库单被作废后，引用它的退货单过账失败，错误消息指出原单据行尚未过账", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const document = await fixture.documentService.create(
      saleReturnInput(originalLineIdOf(outbound), "2"),
    );
    await fixture.postingService.void(outbound.id);

    await expect(fixture.postingService.post(document.id)).rejects.toThrow(
      "引用的原单据行尚未过账",
    );
    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("12.000");
  });

  it("已过账的销售退货单作废后，来源仓账面库存回退，结转金额按原值反向冲销，并新增一条反向流水", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const document = await fixture.documentService.create(
      saleReturnInput(originalLineIdOf(outbound), "2"),
    );
    await fixture.postingService.post(document.id);

    await fixture.postingService.void(document.id);

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("7.000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.direction).toBe("POST");
    expect(entries[1]).toMatchObject({
      direction: "REVERSAL",
      lineNo: 1,
      quantityBefore: "9.000",
      quantityAfter: "7.000",
      unitPrice: "2.000000",
      amount: "-4.00",
    });
  });

  it("作废后的退货不再占用原单行的可退数量，可以重新退同一行", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const originalLineId = originalLineIdOf(outbound);

    const voided = await fixture.documentService.create(saleReturnInput(originalLineId, "5"));
    await fixture.postingService.post(voided.id);
    await fixture.postingService.void(voided.id);

    const document = await fixture.documentService.create(saleReturnInput(originalLineId, "5"));
    await fixture.postingService.post(document.id);

    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries[0]?.amount).toBe("10.00");
  });
});
