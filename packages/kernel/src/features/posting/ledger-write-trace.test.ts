import { describe, expect, it } from "vitest";
import type { DocumentType } from "../../shared/document-types";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { Document, DocumentLine } from "../documents/model";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
import type { StockBalanceKey, StockLedgerRepository } from "../inventory";
import { createPurchaseReturnPostingHandler } from "../purchase-return/purchase-return-posting";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting";
import { createSaleReturnPostingHandler } from "../sales-return/sale-return-posting";
import { createSaleOutboundPostingHandler } from "../selling/sale-outbound-posting";
import { createStocktakePostingHandler } from "../stocktake/stocktake-posting";
import { createInMemoryTransferInTransitRepository } from "../transfer/in-memory-repository";
import { TRANSFER_POSTING_PHASES } from "../transfer/model";
import { createTransferPostingHandler } from "../transfer/posting";
import { createPostingService } from "./service";

const SOURCE = "warehouse-1";
const TARGET = "warehouse-2";

const keyOf = (key: StockBalanceKey): string => `${key.warehouseId}::${key.itemId}`;

const makeLine = (
  id: string,
  lineNo: number,
  itemId: string,
  quantity: string,
  overrides: Partial<DocumentLine> = {},
): DocumentLine => ({
  id,
  lineNo,
  itemId,
  quantity,
  unitPrice: null,
  amount: null,
  originalLineId: null,
  ...overrides,
});

const makeDocument = (
  overrides: Partial<Document> & { id: string; documentNo: string; type: DocumentType },
): Document => ({
  status: "DRAFT",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [],
  ...overrides,
});

type LedgerTrace = {
  ensureCalls: string[][];
  savedKeys: string[];
};

const createFixture = () => {
  const store = createInMemoryStockLedgerRepository();
  const documents = createInMemoryDocumentRepository();
  const inTransit = createInMemoryTransferInTransitRepository();
  const trace: LedgerTrace = { ensureCalls: [], savedKeys: [] };
  const ledger: StockLedgerRepository = {
    ...store,
    async ensureBalances(keys, context) {
      trace.ensureCalls.push(keys.map(keyOf));
      return store.ensureBalances(keys, context);
    },
    async saveBalance(balance, context) {
      trace.savedKeys.push(keyOf(balance));
      return store.saveBalance(balance, context);
    },
  };
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
  const reset = (): void => {
    trace.ensureCalls.length = 0;
    trace.savedKeys.length = 0;
  };
  return { store, documents, inTransit, ledger, postingService, trace, reset };
};

type Fixture = ReturnType<typeof createFixture>;

const seedBalance = async (
  fixture: Fixture,
  itemId: string,
  quantity: string,
  unitCost: string,
  warehouseId = SOURCE,
): Promise<void> => {
  await fixture.store.saveBalance({ warehouseId, itemId, quantity, unitCost });
};

describe("过账的台账写入序列", () => {
  it("采购入库按单据行去重后一次 ensureBalances，并逐行 saveBalance", async () => {
    const fixture = createFixture();
    const document = makeDocument({
      id: "doc-1",
      documentNo: "PIN-20260102-001",
      type: "PURCHASE_INBOUND",
      targetWarehouseId: SOURCE,
      lines: [
        makeLine("line-1", 1, "item-1", "10", { unitPrice: "2" }),
        makeLine("line-2", 2, "item-2", "5", { unitPrice: "3" }),
        makeLine("line-3", 3, "item-1", "4", { unitPrice: "2" }),
      ],
    });
    await fixture.documents.insert(document);

    await fixture.postingService.post(document.id);

    expect(fixture.trace.ensureCalls).toEqual([[`${SOURCE}::item-1`, `${SOURCE}::item-2`]]);
    expect(fixture.trace.savedKeys).toEqual([
      `${SOURCE}::item-1`,
      `${SOURCE}::item-2`,
      `${SOURCE}::item-1`,
    ]);
    expect(await fixture.store.findBalance(SOURCE, "item-1")).toEqual({
      warehouseId: SOURCE,
      itemId: "item-1",
      quantity: "14.000",
      unitCost: "2.000000",
    });
    expect((await fixture.store.findBalance(SOURCE, "item-2"))?.quantity).toBe("5.000");
    const entries = await fixture.store.listEntriesByDocument(document.id);
    expect(entries[0]).toMatchObject({
      quantityBefore: "0.000",
      quantityAfter: "10.000",
      unitPrice: "2.000000",
      amount: "20.00",
    });
    expect(entries[2]).toMatchObject({
      quantityBefore: "10.000",
      quantityAfter: "14.000",
      unitPrice: "2.000000",
      amount: "8.00",
    });
  });

  it("销售出库不调用 ensureBalances，循环后按首次出现的仓库商品顺序批量 saveBalance", async () => {
    const fixture = createFixture();
    await seedBalance(fixture, "item-1", "10.000", "2.000000");
    await seedBalance(fixture, "item-2", "6.000", "3.000000");
    const document = makeDocument({
      id: "doc-1",
      documentNo: "SOUT-20260102-001",
      type: "SALE_OUTBOUND",
      sourceWarehouseId: SOURCE,
      lines: [
        makeLine("line-1", 1, "item-2", "2", { unitPrice: "3.5" }),
        makeLine("line-2", 2, "item-1", "4", { unitPrice: "3.5" }),
        makeLine("line-3", 3, "item-2", "1", { unitPrice: "3.5" }),
      ],
    });
    await fixture.documents.insert(document);

    await fixture.postingService.post(document.id);

    expect(fixture.trace.ensureCalls).toEqual([]);
    expect(fixture.trace.savedKeys).toEqual([`${SOURCE}::item-2`, `${SOURCE}::item-1`]);
    expect((await fixture.store.findBalance(SOURCE, "item-2"))?.quantity).toBe("3.000");
    expect((await fixture.store.findBalance(SOURCE, "item-1"))?.quantity).toBe("6.000");
    const entries = await fixture.store.listEntriesByDocument(document.id);
    expect(entries).toHaveLength(3);
    expect(entries[1]).toMatchObject({
      quantityBefore: "10.000",
      quantityAfter: "6.000",
      unitPrice: "2.000000",
      amount: "8.00",
    });
  });

  it("销售退货按单据行去重后一次 ensureBalances，并逐行 saveBalance", async () => {
    const fixture = createFixture();
    await seedBalance(fixture, "item-1", "10.000", "2.000000");
    const outbound = makeDocument({
      id: "doc-out",
      documentNo: "SOUT-20260102-002",
      type: "SALE_OUTBOUND",
      sourceWarehouseId: SOURCE,
      lines: [makeLine("out-line-1", 1, "item-1", "10", { unitPrice: "3.5" })],
    });
    await fixture.documents.insert(outbound);
    await fixture.postingService.post(outbound.id);
    fixture.reset();
    const saleReturn = makeDocument({
      id: "doc-1",
      documentNo: "SRET-20260102-001",
      type: "SALE_RETURN",
      sourceWarehouseId: SOURCE,
      lines: [
        makeLine("ret-line-1", 1, "item-1", "2", { originalLineId: "out-line-1" }),
        makeLine("ret-line-2", 2, "item-1", "3", { originalLineId: "out-line-1" }),
      ],
    });
    await fixture.documents.insert(saleReturn);

    await fixture.postingService.post(saleReturn.id);

    expect(fixture.trace.ensureCalls).toEqual([[`${SOURCE}::item-1`]]);
    expect(fixture.trace.savedKeys).toEqual([`${SOURCE}::item-1`, `${SOURCE}::item-1`]);
    expect(await fixture.store.findBalance(SOURCE, "item-1")).toEqual({
      warehouseId: SOURCE,
      itemId: "item-1",
      quantity: "5.000",
      unitCost: "2.000000",
    });
    const entries = await fixture.store.listEntriesByDocument(saleReturn.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      quantityBefore: "0.000",
      quantityAfter: "2.000",
      unitPrice: "2.000000",
      amount: "4.00",
    });
    expect(entries[1]).toMatchObject({
      quantityBefore: "2.000",
      quantityAfter: "5.000",
      unitPrice: "2.000000",
      amount: "6.00",
    });
  });

  it("采购退货不调用 ensureBalances，循环后按首次出现的仓库商品顺序批量 saveBalance", async () => {
    const fixture = createFixture();
    const inbound = makeDocument({
      id: "doc-in",
      documentNo: "PIN-20260102-002",
      type: "PURCHASE_INBOUND",
      targetWarehouseId: SOURCE,
      lines: [
        makeLine("in-line-1", 1, "item-1", "10", { unitPrice: "2" }),
        makeLine("in-line-2", 2, "item-2", "4", { unitPrice: "3" }),
      ],
    });
    await fixture.documents.insert(inbound);
    await fixture.postingService.post(inbound.id);
    fixture.reset();
    const purchaseReturn = makeDocument({
      id: "doc-1",
      documentNo: "PRET-20260102-001",
      type: "PURCHASE_RETURN",
      sourceWarehouseId: SOURCE,
      lines: [
        makeLine("ret-line-1", 1, "item-1", "3", { originalLineId: "in-line-1" }),
        makeLine("ret-line-2", 2, "item-2", "1", { originalLineId: "in-line-2" }),
        makeLine("ret-line-3", 3, "item-1", "2", { originalLineId: "in-line-1" }),
      ],
    });
    await fixture.documents.insert(purchaseReturn);

    await fixture.postingService.post(purchaseReturn.id);

    expect(fixture.trace.ensureCalls).toEqual([]);
    expect(fixture.trace.savedKeys).toEqual([`${SOURCE}::item-1`, `${SOURCE}::item-2`]);
    expect(await fixture.store.findBalance(SOURCE, "item-1")).toEqual({
      warehouseId: SOURCE,
      itemId: "item-1",
      quantity: "5.000",
      unitCost: "2.000000",
    });
    expect((await fixture.store.findBalance(SOURCE, "item-2"))?.quantity).toBe("3.000");
    const entries = await fixture.store.listEntriesByDocument(purchaseReturn.id);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      quantityBefore: "10.000",
      quantityAfter: "7.000",
      amount: "6.00",
    });
    expect(entries[2]).toMatchObject({
      quantityBefore: "7.000",
      quantityAfter: "5.000",
      amount: "4.00",
    });
  });

  it("盘点按全部单据行一次 ensureBalances，只 saveBalance 有变化的行", async () => {
    const fixture = createFixture();
    await seedBalance(fixture, "item-1", "10.000", "2.000000");
    await seedBalance(fixture, "item-3", "2.000", "4.000000");
    const document = makeDocument({
      id: "doc-1",
      documentNo: "STK-20260102-001",
      type: "STOCKTAKE",
      warehouseId: SOURCE,
      lines: [
        makeLine("line-1", 1, "item-1", "12"),
        makeLine("line-2", 2, "item-2", "0"),
        makeLine("line-3", 3, "item-3", "5"),
      ],
    });
    await fixture.documents.insert(document);

    await fixture.postingService.post(document.id);

    expect(fixture.trace.ensureCalls).toEqual([
      [`${SOURCE}::item-1`, `${SOURCE}::item-2`, `${SOURCE}::item-3`],
    ]);
    expect(fixture.trace.savedKeys).toEqual([`${SOURCE}::item-1`, `${SOURCE}::item-3`]);
    expect(await fixture.store.findBalance(SOURCE, "item-1")).toEqual({
      warehouseId: SOURCE,
      itemId: "item-1",
      quantity: "12.000",
      unitCost: "2.000000",
    });
    expect(await fixture.store.findBalance(SOURCE, "item-3")).toEqual({
      warehouseId: SOURCE,
      itemId: "item-3",
      quantity: "5.000",
      unitCost: "4.000000",
    });
    const entries = await fixture.store.listEntriesByDocument(document.id);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      quantityBefore: "2.000",
      quantityAfter: "5.000",
      unitPrice: "4.000000",
      amount: "12.00",
    });
  });

  it("调拨调出按调出仓加单据行商品 ensureBalances，调入按目标仓加在途记录商品 ensureBalances", async () => {
    const fixture = createFixture();
    await seedBalance(fixture, "item-1", "10.000", "2.500000");
    await seedBalance(fixture, "item-2", "6.000", "3.000000");
    const document = makeDocument({
      id: "doc-1",
      documentNo: "TRF-20260102-001",
      type: "TRANSFER",
      sourceWarehouseId: SOURCE,
      targetWarehouseId: TARGET,
      lines: [
        makeLine("line-1", 1, "item-1", "4", { unitPrice: "2.5" }),
        makeLine("line-2", 2, "item-2", "2", { unitPrice: "2.5" }),
      ],
    });
    await fixture.documents.insert(document);

    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.OUT);

    expect(fixture.trace.ensureCalls).toEqual([[`${SOURCE}::item-1`, `${SOURCE}::item-2`]]);
    expect(fixture.trace.savedKeys).toEqual([`${SOURCE}::item-1`, `${SOURCE}::item-2`]);
    expect((await fixture.store.findBalance(SOURCE, "item-1"))?.quantity).toBe("6.000");
    const records = await fixture.inTransit.listByDocument(document.id);
    expect(records).toHaveLength(2);
    const first = records.find((record) => record.lineNo === 1);
    const second = records.find((record) => record.lineNo === 2);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) {
      return;
    }
    await fixture.inTransit.update({ ...first, itemId: "item-9" });
    await fixture.inTransit.update({ ...second, itemId: "item-10" });
    fixture.reset();

    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.IN);

    expect(fixture.trace.ensureCalls).toEqual([[`${TARGET}::item-9`, `${TARGET}::item-10`]]);
    expect(fixture.trace.savedKeys).toEqual([`${TARGET}::item-9`, `${TARGET}::item-10`]);
    expect(await fixture.store.findBalance(TARGET, "item-9")).toEqual({
      warehouseId: TARGET,
      itemId: "item-9",
      quantity: "4.000",
      unitCost: "2.500000",
    });
    expect((await fixture.store.findBalance(TARGET, "item-10"))?.quantity).toBe("2.000");
    const entries = await fixture.store.listEntriesByDocument(document.id);
    expect(entries).toHaveLength(4);
    const targetEntries = entries.filter((entry) => entry.warehouseId === TARGET);
    expect(targetEntries).toHaveLength(2);
    expect(targetEntries[0]).toMatchObject({
      warehouseId: TARGET,
      itemId: "item-9",
      quantityBefore: "0.000",
      quantityAfter: "4.000",
      unitPrice: "2.500000",
      amount: "10.00",
    });
  });
});
