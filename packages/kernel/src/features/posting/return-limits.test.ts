import { QUANTITY_SCALE, quantity, toFixedString } from "@erp-inventory-sales/shared";
import { describe, expect, it } from "vitest";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { Document, DocumentInput } from "../documents/model";
import type { DocumentRepository } from "../documents/ports";
import { createDocumentService } from "../documents/service";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository";
import { createItemMasterService } from "../item-master/service";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
import type { StockLedgerRepository } from "../inventory/ports";
import { createPurchaseReturnPostingHandler } from "../purchase-return/purchase-return-posting";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting";
import { createSaleReturnPostingHandler } from "../sales-return/sale-return-posting";
import { createSaleOutboundPostingHandler } from "../selling/sale-outbound-posting";
import { sumReturned } from "./returns";
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

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const purchaseInboundInput = (itemId: string, quantityText: string): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId, quantity: quantityText, unitPrice: "2", amount: null }],
});

const saleOutboundInput = (itemId: string, quantityText: string): DocumentInput => ({
  type: "SALE_OUTBOUND",
  supplierId: null,
  customerId: "customer-1",
  sourceWarehouseId: "warehouse-1",
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId, quantity: quantityText, unitPrice: "3.5", amount: null }],
});

const returnInput = (
  type: "SALE_RETURN" | "PURCHASE_RETURN",
  originalLineId: string,
  quantityText: string,
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
      quantity: quantityText,
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

const netReturnedQuantityByLedger = async (
  documents: DocumentRepository,
  ledger: StockLedgerRepository,
  originalLineId: string,
): Promise<string> => {
  const references = await documents.listReturnLineReferences(originalLineId);
  let total = quantity("0.000");
  for (const reference of references) {
    const entries = await ledger.listEntriesByDocument(reference.documentId);
    for (const entry of entries) {
      if (entry.lineNo !== reference.lineNo) {
        continue;
      }
      const delta = quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore));
      total = quantity(toFixedString(total.plus(delta), QUANTITY_SCALE));
    }
  }
  return toFixedString(total.abs(), QUANTITY_SCALE);
};

const seedOutbound = async (fixture: Fixture): Promise<Document> => {
  const inbound = await fixture.documentService.create(purchaseInboundInput(fixture.item.id, "12"));
  await fixture.postingService.post(inbound.id);
  const outbound = await fixture.documentService.create(saleOutboundInput(fixture.item.id, "5"));
  await fixture.postingService.post(outbound.id);
  return outbound;
};

const seedInbound = async (fixture: Fixture): Promise<Document> => {
  const inbound = await fixture.documentService.create(purchaseInboundInput(fixture.item.id, "12"));
  await fixture.postingService.post(inbound.id);
  return inbound;
};

describe("超退上限的两种口径", () => {
  it("销售退货单：累计退货数量在「汇总已过账退货行数量」与「汇总库存流水净额」两种口径下一致", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const originalLineId = originalLineIdOf(outbound);

    const first = await fixture.documentService.create(
      returnInput("SALE_RETURN", originalLineId, "2"),
    );
    await fixture.postingService.post(first.id);
    const second = await fixture.documentService.create(
      returnInput("SALE_RETURN", originalLineId, "1"),
    );
    await fixture.postingService.post(second.id);

    const summary = await sumReturned(fixture.documents, fixture.ledger, originalLineId);

    expect(toFixedString(summary.quantity, QUANTITY_SCALE)).toBe("3.000");
    expect(
      await netReturnedQuantityByLedger(fixture.documents, fixture.ledger, originalLineId),
    ).toBe("3.000");
    expect(await fixture.documents.sumPostedReturnedQuantity(originalLineId)).toBe("3.000");
  });

  it("采购退货单：累计退货数量在两种口径下一致", async () => {
    const fixture = await createFixture();
    const inbound = await seedInbound(fixture);
    const originalLineId = originalLineIdOf(inbound);

    const first = await fixture.documentService.create(
      returnInput("PURCHASE_RETURN", originalLineId, "2"),
    );
    await fixture.postingService.post(first.id);
    const second = await fixture.documentService.create(
      returnInput("PURCHASE_RETURN", originalLineId, "1"),
    );
    await fixture.postingService.post(second.id);

    const summary = await sumReturned(fixture.documents, fixture.ledger, originalLineId);

    expect(toFixedString(summary.quantity, QUANTITY_SCALE)).toBe("3.000");
    expect(
      await netReturnedQuantityByLedger(fixture.documents, fixture.ledger, originalLineId),
    ).toBe("3.000");
    expect(await fixture.documents.sumPostedReturnedQuantity(originalLineId)).toBe("3.000");
  });

  it("已作废的退货单不占用原单据行的可退数量，两种口径都归零", async () => {
    const fixture = await createFixture();
    const outbound = await seedOutbound(fixture);
    const originalLineId = originalLineIdOf(outbound);

    const voided = await fixture.documentService.create(
      returnInput("SALE_RETURN", originalLineId, "2"),
    );
    await fixture.postingService.post(voided.id);
    await fixture.postingService.void(voided.id);

    const summary = await sumReturned(fixture.documents, fixture.ledger, originalLineId);

    expect(toFixedString(summary.quantity, QUANTITY_SCALE)).toBe("0.000");
    expect(
      await netReturnedQuantityByLedger(fixture.documents, fixture.ledger, originalLineId),
    ).toBe("0.000");
    expect(await fixture.documents.sumPostedReturnedQuantity(originalLineId)).toBe("0.000");
  });
});
