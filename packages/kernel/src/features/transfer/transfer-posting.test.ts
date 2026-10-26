import { describe, expect, it } from "vitest";
import { StockNegativeError, ValidationError } from "../../shared/errors";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { DocumentInput } from "../documents/model";
import { createDocumentService } from "../documents/service";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting";
import { createPostingService } from "../posting/service";
import { TRANSFER_POSTING_PHASES } from "./model";
import { createInMemoryTransferInTransitRepository } from "./in-memory-repository";
import { createTransferPostingHandler } from "./posting";

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const SOURCE_WAREHOUSE = "warehouse-1";
const TARGET_WAREHOUSE = "warehouse-2";

const createFixture = async () => {
  const documents = createInMemoryDocumentRepository();
  const ledger = createInMemoryStockLedgerRepository();
  const inTransit = createInMemoryTransferInTransitRepository();
  let counter = 0;
  const documentService = createDocumentService(documents, {
    idGenerator: () => `doc-${++counter}`,
    clock: () => FIXED_CLOCK,
    timeZone: "Asia/Shanghai",
  });
  const postingService = createPostingService({
    documents,
    ledger,
    handlers: [
      createPurchaseInboundPostingHandler(ledger),
      createTransferPostingHandler(ledger, inTransit),
    ],
  });
  return { documents, ledger, inTransit, documentService, postingService };
};

const seedSourceStock = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  quantity: string,
  unitPrice: string,
): Promise<void> => {
  const inbound = await fixture.documentService.create({
    type: "PURCHASE_INBOUND",
    supplierId: "supplier-1",
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: SOURCE_WAREHOUSE,
    warehouseId: null,
    lines: [{ itemId: "item-1", quantity, unitPrice, amount: null }],
  });
  await fixture.postingService.post(inbound.id);
};

const transferInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  type: "TRANSFER",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: SOURCE_WAREHOUSE,
  targetWarehouseId: TARGET_WAREHOUSE,
  warehouseId: null,
  lines: [{ itemId: "item-1", quantity: "4", unitPrice: "2.5", amount: null }],
  ...overrides,
});

const out = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  documentId: string,
): Promise<unknown> =>
  fixture.postingService.post(documentId, undefined, TRANSFER_POSTING_PHASES.OUT);

const into = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  documentId: string,
): Promise<unknown> =>
  fixture.postingService.post(documentId, undefined, TRANSFER_POSTING_PHASES.IN);

describe("调拨单的调出过账", () => {
  it("调出过账后源仓该商品的账面库存减少该行数量，结转成本等于过账前的加权平均成本乘数量，流水记录这笔结转金额", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());

    await out(fixture, document.id);

    const balance = await fixture.ledger.findBalance(SOURCE_WAREHOUSE, "item-1");
    expect(balance?.quantity).toBe("6.000");
    expect(balance?.unitCost).toBe("2.500000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      lineNo: 1,
      warehouseId: SOURCE_WAREHOUSE,
      itemId: "item-1",
      direction: "POST",
      quantityBefore: "10.000",
      quantityAfter: "6.000",
      unitPrice: "2.500000",
      amount: "10.00",
    });
    expect(typeof entries[0]?.amount).toBe("string");
    expect(typeof entries[0]?.unitPrice).toBe("string");
  });

  it("调出过账后生成携带成本的在途记录：在途数量与在途成本能在该调拨单上查到", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());

    await out(fixture, document.id);

    const records = await fixture.inTransit.listByDocument(document.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      documentId: document.id,
      documentNo: document.documentNo,
      lineNo: 1,
      itemId: "item-1",
      sourceWarehouseId: SOURCE_WAREHOUSE,
      targetWarehouseId: TARGET_WAREHOUSE,
      quantity: "4.000",
      unitCost: "2.500000",
      status: "IN_TRANSIT",
    });
    expect(typeof records[0]?.quantity).toBe("string");
    expect(typeof records[0]?.unitCost).toBe("string");
  });

  it("调出过账后单据状态为已过账，目标仓账面库存不受影响", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());

    const posted = await out(fixture, document.id);

    expect((posted as { status: string }).status).toBe("POSTED");
    expect(await fixture.ledger.findBalance(TARGET_WAREHOUSE, "item-1")).toBeNull();
  });
});

describe("调拨单的调入过账", () => {
  it("调入过账后目标仓该商品账面库存增加该行数量，加权平均成本以在途成本作为入库单价并入", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());
    await out(fixture, document.id);

    await into(fixture, document.id);

    const balance = await fixture.ledger.findBalance(TARGET_WAREHOUSE, "item-1");
    expect(balance?.quantity).toBe("4.000");
    expect(balance?.unitCost).toBe("2.500000");
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      lineNo: 1,
      warehouseId: TARGET_WAREHOUSE,
      direction: "POST",
      quantityBefore: "0.000",
      quantityAfter: "4.000",
      unitPrice: "2.500000",
      amount: "10.00",
    });
  });

  it("目标仓已有库存时，调入按加权规则并入：数量相加、均价按两批数量加权", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const inbound = await fixture.documentService.create({
      type: "PURCHASE_INBOUND",
      supplierId: "supplier-1",
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: TARGET_WAREHOUSE,
      warehouseId: null,
      lines: [{ itemId: "item-1", quantity: "6", unitPrice: "4", amount: null }],
    });
    await fixture.postingService.post(inbound.id);
    const document = await fixture.documentService.create(transferInput());
    await out(fixture, document.id);

    await into(fixture, document.id);

    const balance = await fixture.ledger.findBalance(TARGET_WAREHOUSE, "item-1");
    expect(balance?.quantity).toBe("10.000");
    expect(balance?.unitCost).toBe("3.400000");
  });

  it("未调出过账就发起调入过账的请求被拒绝，错误消息指出该调拨单尚未调出", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());

    const failure = await into(fixture, document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).message).toContain("尚未调出");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });
});

describe("调拨的在途口径", () => {
  it("调出已过账、调入未过账时，这批数量既不在源仓也不在目标仓的账面库存里，在途数量上能查到", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());

    await out(fixture, document.id);

    expect((await fixture.ledger.findBalance(SOURCE_WAREHOUSE, "item-1"))?.quantity).toBe("6.000");
    expect(await fixture.ledger.findBalance(TARGET_WAREHOUSE, "item-1")).toBeNull();
    const inTransit = await fixture.inTransit.listInTransit(SOURCE_WAREHOUSE, "item-1");
    expect(inTransit).toEqual([
      { warehouseId: SOURCE_WAREHOUSE, itemId: "item-1", quantity: "4.000" },
    ]);
  });

  it("调入过账后这批数量不再计入在途，该调拨单的在途数量归零", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());
    await out(fixture, document.id);

    await into(fixture, document.id);

    expect(await fixture.inTransit.listInTransit(SOURCE_WAREHOUSE, "item-1")).toEqual([]);
    const records = await fixture.inTransit.listByDocument(document.id);
    expect(records[0]?.quantity).toBe("0.000");
    expect(records[0]?.status).toBe("RECEIVED");
  });
});

describe("调拨过账的负库存守卫", () => {
  it("调出过账会使源仓账面库存变负时整单调出过账失败，失败后源仓库存与库存流水都不发生变化，错误消息报出将变为负数的数量", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "3", "2.5");
    const document = await fixture.documentService.create(transferInput());

    const failure = await out(fixture, document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    expect((failure as StockNegativeError).message).toContain("-1.000");
    expect((await fixture.ledger.findBalance(SOURCE_WAREHOUSE, "item-1"))?.quantity).toBe("3.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect(await fixture.inTransit.listByDocument(document.id)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });

  it("整单失败且无部分写入：一张含两行、其中一行调出会致负的调拨单，调出失败后单据仍为草稿，第一行对应的源仓库存与流水都没有写入", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(
      transferInput({
        lines: [
          { itemId: "item-1", quantity: "2", unitPrice: "2.5", amount: null },
          { itemId: "item-1", quantity: "20", unitPrice: "2.5", amount: null },
        ],
      }),
    );

    const failure = await out(fixture, document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    expect((await fixture.ledger.findBalance(SOURCE_WAREHOUSE, "item-1"))?.quantity).toBe("10.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
    expect(await fixture.inTransit.listByDocument(document.id)).toEqual([]);
    expect((await fixture.documentService.get(document.id)).status).toBe("DRAFT");
  });

  it("源仓与目标仓相同的调拨单过账失败，错误消息指出源仓与目标仓必须不同", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());
    await fixture.documents.update({
      ...document,
      targetWarehouseId: SOURCE_WAREHOUSE,
    });

    const failure = await out(fixture, document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).message).toContain("源仓与目标仓必须不同");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
  });
});

describe("调拨过账的幂等与阶段语义", () => {
  it("同一阶段重复过账幂等短路：第二次调出过账不产生第二次库存影响与流水", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());

    await out(fixture, document.id);
    await out(fixture, document.id);

    expect((await fixture.ledger.findBalance(SOURCE_WAREHOUSE, "item-1"))?.quantity).toBe("6.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toHaveLength(1);
    expect(await fixture.inTransit.listByDocument(document.id)).toHaveLength(1);
  });

  it("不同阶段各能过账一次：调出与调入都完成后单据仍为已过账，库存出现源仓与目标仓两条流水", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());

    await out(fixture, document.id);
    const afterOut = await fixture.documentService.get(document.id);
    expect(afterOut.status).toBe("POSTED");
    await into(fixture, document.id);
    const afterIn = await fixture.documentService.get(document.id);

    expect(afterIn.status).toBe("POSTED");
    expect((await fixture.ledger.findBalance(SOURCE_WAREHOUSE, "item-1"))?.quantity).toBe("6.000");
    expect((await fixture.ledger.findBalance(TARGET_WAREHOUSE, "item-1"))?.quantity).toBe("4.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toHaveLength(2);
  });

  it("同一阶段重复调入过账幂等短路：第二次调入不再重复入库", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());
    await out(fixture, document.id);

    await into(fixture, document.id);
    await into(fixture, document.id);

    expect((await fixture.ledger.findBalance(TARGET_WAREHOUSE, "item-1"))?.quantity).toBe("4.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toHaveLength(2);
  });

  it("调拨单不带阶段过账被拒绝：必须指定调出或调入阶段", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());

    const failure = await fixture.postingService.post(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).message).toContain("不支持的过账阶段");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toEqual([]);
  });
});

describe("调拨单的作废", () => {
  it("作废调出已过账、调入未过账的调拨单后，这批数量回到源仓账面库存，在途归零，流水出现一条数量相反的反向流水", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());
    await out(fixture, document.id);

    await fixture.postingService.void(document.id);

    expect((await fixture.ledger.findBalance(SOURCE_WAREHOUSE, "item-1"))?.quantity).toBe("10.000");
    expect(await fixture.inTransit.listByDocument(document.id)).toEqual([]);
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      direction: "REVERSAL",
      warehouseId: SOURCE_WAREHOUSE,
      quantityBefore: "6.000",
      quantityAfter: "10.000",
      amount: "-10.00",
    });
  });

  it("作废调出与调入都已过账的调拨单后，源仓恢复该批数量、目标仓扣回该批数量、在途归零，流水追加两条数量相反的反向流水", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());
    await out(fixture, document.id);
    await into(fixture, document.id);

    await fixture.postingService.void(document.id);

    expect((await fixture.ledger.findBalance(SOURCE_WAREHOUSE, "item-1"))?.quantity).toBe("10.000");
    expect((await fixture.ledger.findBalance(TARGET_WAREHOUSE, "item-1"))?.quantity).toBe("0.000");
    expect(await fixture.inTransit.listByDocument(document.id)).toEqual([]);
    const entries = await fixture.ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(4);
    const reversals = entries.filter((entry) => entry.direction === "REVERSAL");
    expect(reversals).toHaveLength(2);
    const outReversal = reversals.find((entry) => entry.warehouseId === SOURCE_WAREHOUSE);
    const inReversal = reversals.find((entry) => entry.warehouseId === TARGET_WAREHOUSE);
    expect(outReversal).toMatchObject({
      quantityBefore: "6.000",
      quantityAfter: "10.000",
      amount: "-10.00",
    });
    expect(inReversal).toMatchObject({
      quantityBefore: "4.000",
      quantityAfter: "0.000",
      amount: "-10.00",
    });
  });

  it("作废会致负时整单作废失败：目标仓数量已被卖掉时作废两段都完成的调拨单被拒绝，库存与流水都不变化", async () => {
    const fixture = await createFixture();
    await seedSourceStock(fixture, "10", "2.5");
    const document = await fixture.documentService.create(transferInput());
    await out(fixture, document.id);
    await into(fixture, document.id);
    await fixture.ledger.saveBalance({
      warehouseId: TARGET_WAREHOUSE,
      itemId: "item-1",
      quantity: "1.000",
      unitCost: "2.500000",
    });

    const failure = await fixture.postingService.void(document.id).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(failure).toBeInstanceOf(StockNegativeError);
    expect((await fixture.ledger.findBalance(TARGET_WAREHOUSE, "item-1"))?.quantity).toBe("1.000");
    expect(await fixture.ledger.listEntriesByDocumentNo(document.documentNo)).toHaveLength(2);
    expect((await fixture.documentService.get(document.id)).status).toBe("POSTED");
  });
});
