import { QUANTITY_SCALE, quantity, toFixedString } from "@erp-project/shared";
import { describe, expect, it } from "vitest";
import { StateConflictError } from "../../shared/errors";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { Document, DocumentInput } from "../documents/model";
import { createDocumentService } from "../documents/service";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository";
import { createItemMasterService } from "../item-master/service";
import type { StockLedgerEntry } from "../inventory";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
import { createPurchaseReturnPostingHandler } from "../purchase-return/purchase-return-posting";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting";
import { createSaleReturnPostingHandler } from "../sales-return/sale-return-posting";
import { createSaleOutboundPostingHandler } from "../selling/sale-outbound-posting";
import { createPostingService } from "./service";

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
    auxiliaryUnits: [],
  });
  return { documents, ledger, documentService, postingService, item };
};

const purchaseInboundInput = (
  itemId: string,
  quantity: string,
  unitPriceText = "2",
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

const returnInput = (
  type: "SALE_RETURN" | "PURCHASE_RETURN",
  originalLineId: string,
  quantity: string,
): DocumentInput => ({
  type,
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
});

const originalLineIdOf = (document: Document): string => {
  const lineId = document.lines[0]?.id;
  if (lineId === undefined) {
    throw new Error("原单据没有单据行");
  }
  return lineId;
};

const netQuantityOf = (entries: StockLedgerEntry[]): string => {
  let total = "0.000";
  for (const entry of entries) {
    total = toFixedString(
      quantity(total).plus(quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore))),
      QUANTITY_SCALE,
    );
  }
  return total;
};

const seedOutboundWithReturn = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
): Promise<{ inbound: Document; outbound: Document; saleReturn: Document }> => {
  const inbound = await fixture.documentService.create(purchaseInboundInput(fixture.item.id, "10"));
  await fixture.postingService.post(inbound.id);
  const outbound = await fixture.documentService.create(saleOutboundInput(fixture.item.id, "10"));
  await fixture.postingService.post(outbound.id);
  const saleReturn = await fixture.documentService.create(
    returnInput("SALE_RETURN", originalLineIdOf(outbound), "10"),
  );
  return { inbound, outbound, saleReturn };
};

describe("作废被已过账退货单引用的原单据", () => {
  it("作废被已过账销售退货单引用的销售出库单被拒，账面库存仍为 10.000，库存流水仍是三条且没有新增冲销流水", async () => {
    const fixture = await createFixture();
    const { inbound, outbound, saleReturn } = await seedOutboundWithReturn(fixture);
    await fixture.postingService.post(saleReturn.id);

    const failure = await fixture.postingService.void(outbound.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StateConflictError);
    const message = (failure as StateConflictError).message;
    expect(message).toContain("已被过账的退货单引用");
    expect(message).toContain(saleReturn.documentNo);
    expect(message).toContain("请先作废退货单");

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("10.000");

    const inboundEntries = await fixture.ledger.listEntriesByDocumentNo(inbound.documentNo);
    const outboundEntries = await fixture.ledger.listEntriesByDocumentNo(outbound.documentNo);
    const returnEntries = await fixture.ledger.listEntriesByDocumentNo(saleReturn.documentNo);
    expect(inboundEntries).toHaveLength(1);
    expect(outboundEntries).toHaveLength(1);
    expect(returnEntries).toHaveLength(1);
    expect(netQuantityOf(inboundEntries)).toBe("10.000");
    expect(netQuantityOf(outboundEntries)).toBe("-10.000");
    expect(netQuantityOf(returnEntries)).toBe("10.000");
    expect(netQuantityOf([...inboundEntries, ...outboundEntries, ...returnEntries])).toBe("10.000");
  });

  it("先作废退货单、再作废原单据成功：作废退货单后账面库存 0.000，再作废原单据后回到 10.000，库存流水共五条净额 10.000", async () => {
    const fixture = await createFixture();
    const { inbound, outbound, saleReturn } = await seedOutboundWithReturn(fixture);
    await fixture.postingService.post(saleReturn.id);

    await fixture.postingService.void(saleReturn.id);
    expect((await fixture.ledger.findBalance("warehouse-1", fixture.item.id))?.quantity).toBe(
      "0.000",
    );

    await fixture.postingService.void(outbound.id);
    expect((await fixture.ledger.findBalance("warehouse-1", fixture.item.id))?.quantity).toBe(
      "10.000",
    );

    const entries = [
      ...(await fixture.ledger.listEntriesByDocumentNo(inbound.documentNo)),
      ...(await fixture.ledger.listEntriesByDocumentNo(outbound.documentNo)),
      ...(await fixture.ledger.listEntriesByDocumentNo(saleReturn.documentNo)),
    ];
    expect(entries).toHaveLength(5);
    expect(netQuantityOf(entries)).toBe("10.000");
  });

  it("引用的退货单还是草稿时不构成引用，原单据可以正常作废", async () => {
    const fixture = await createFixture();
    const { inbound, outbound, saleReturn } = await seedOutboundWithReturn(fixture);

    await fixture.postingService.void(outbound.id);

    expect((await fixture.ledger.findBalance("warehouse-1", fixture.item.id))?.quantity).toBe(
      "10.000",
    );
    const entries = [
      ...(await fixture.ledger.listEntriesByDocumentNo(inbound.documentNo)),
      ...(await fixture.ledger.listEntriesByDocumentNo(outbound.documentNo)),
      ...(await fixture.ledger.listEntriesByDocumentNo(saleReturn.documentNo)),
    ];
    expect(entries).toHaveLength(3);
    expect(netQuantityOf(entries)).toBe("10.000");
  });

  it("已作废的退货单不构成引用，原单据可以正常作废", async () => {
    const fixture = await createFixture();
    const { inbound, outbound, saleReturn } = await seedOutboundWithReturn(fixture);
    await fixture.postingService.post(saleReturn.id);
    await fixture.postingService.void(saleReturn.id);

    await fixture.postingService.void(outbound.id);

    expect((await fixture.ledger.findBalance("warehouse-1", fixture.item.id))?.quantity).toBe(
      "10.000",
    );
    const entries = [
      ...(await fixture.ledger.listEntriesByDocumentNo(inbound.documentNo)),
      ...(await fixture.ledger.listEntriesByDocumentNo(outbound.documentNo)),
      ...(await fixture.ledger.listEntriesByDocumentNo(saleReturn.documentNo)),
    ];
    expect(entries).toHaveLength(5);
    expect(netQuantityOf(entries)).toBe("10.000");
  });

  it("作废被已过账采购退货单引用的采购入库单同样被拒，错误消息指出被引用的采购退货单", async () => {
    const fixture = await createFixture();
    const inbound = await fixture.documentService.create(
      purchaseInboundInput(fixture.item.id, "10"),
    );
    await fixture.postingService.post(inbound.id);
    const purchaseReturn = await fixture.documentService.create(
      returnInput("PURCHASE_RETURN", originalLineIdOf(inbound), "4"),
    );
    await fixture.postingService.post(purchaseReturn.id);

    const failure = await fixture.postingService.void(inbound.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StateConflictError);
    const message = (failure as StateConflictError).message;
    expect(message).toContain("已被过账的退货单引用");
    expect(message).toContain(purchaseReturn.documentNo);
    expect(message).toContain("请先作废退货单");

    const balance = await fixture.ledger.findBalance("warehouse-1", fixture.item.id);
    expect(balance?.quantity).toBe("6.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(inbound.documentNo)).toHaveLength(1);
  });

  it("作废被拒后原单据仍是已过账状态，没有产生任何冲销流水", async () => {
    const fixture = await createFixture();
    const { outbound, saleReturn } = await seedOutboundWithReturn(fixture);
    await fixture.postingService.post(saleReturn.id);
    const statusBefore = (await fixture.documentService.get(outbound.id)).status;

    await fixture.postingService.void(outbound.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect((await fixture.documentService.get(outbound.id)).status).toBe(statusBefore);
    expect(await fixture.ledger.listEntriesByDocumentNo(outbound.documentNo)).toHaveLength(1);
  });
});
