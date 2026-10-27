import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/errors";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { DocumentInput } from "../documents/model";
import { createDocumentService } from "../documents/service";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting";
import { DEFAULT_POSTING_PHASE, isPostingPhase, POSTING_PHASES } from "./model";
import type { PostingPhase } from "./model";
import { POSTING_PHASE_SEQUENCES } from "./phases";
import { createPostingService } from "./service";

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const createFixture = async () => {
  const documents = createInMemoryDocumentRepository();
  const ledger = createInMemoryStockLedgerRepository();
  let counter = 0;
  const documentService = createDocumentService(documents, {
    idGenerator: () => `doc-${++counter}`,
    clock: () => FIXED_CLOCK,
    timeZone: "Asia/Shanghai",
  });
  const postingService = createPostingService({
    documents,
    ledger,
    handlers: [createPurchaseInboundPostingHandler(ledger)],
  });
  return { documentService, postingService };
};

const purchaseInboundInput = (): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId: "item-1", quantity: "12", unitPrice: "1.115", amount: null }],
});

const failureOf = async (work: Promise<unknown>): Promise<ValidationError> => {
  const failure = await work.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(failure instanceof ValidationError)) {
    throw new Error("过账没有按预期失败");
  }
  return failure;
};

describe("过账阶段表", () => {
  it("过账阶段是闭联合，值恰好是默认、调出与调入三个", () => {
    expect(POSTING_PHASES).toEqual({ DEFAULT: "DEFAULT", OUT: "OUT", IN: "IN" });
    expect(DEFAULT_POSTING_PHASE).toBe("DEFAULT");
    expect(isPostingPhase("DEFAULT")).toBe(true);
    expect(isPostingPhase("OUT")).toBe(true);
    expect(isPostingPhase("IN")).toBe(true);
    expect(isPostingPhase("SIDEWAYS")).toBe(false);
  });

  it("阶段表显式声明调拨单的阶段顺序是调出到调入，其余单据只有默认阶段", () => {
    expect(POSTING_PHASE_SEQUENCES.TRANSFER).toEqual([POSTING_PHASES.OUT, POSTING_PHASES.IN]);
    expect(POSTING_PHASE_SEQUENCES.PURCHASE_INBOUND).toEqual([POSTING_PHASES.DEFAULT]);
    expect(POSTING_PHASE_SEQUENCES.SALE_OUTBOUND).toEqual([POSTING_PHASES.DEFAULT]);
    expect(POSTING_PHASE_SEQUENCES.SALE_RETURN).toEqual([POSTING_PHASES.DEFAULT]);
    expect(POSTING_PHASE_SEQUENCES.PURCHASE_RETURN).toEqual([POSTING_PHASES.DEFAULT]);
    expect(POSTING_PHASE_SEQUENCES.STOCKTAKE).toEqual([POSTING_PHASES.DEFAULT]);
  });

  it("全局非法的阶段名被内核拒绝，错误消息沿用既有措辞", async () => {
    const { documentService, postingService } = await createFixture();
    const document = await documentService.create(purchaseInboundInput());
    const rawPhase: string = "SIDEWAYS";

    const failure = await failureOf(
      postingService.post(document.id, undefined, rawPhase as PostingPhase),
    );

    expect(failure.message).toBe(`单据 ${document.documentNo} 不支持的过账阶段：SIDEWAYS`);
  });

  it("全局合法但该单据类型不支持的阶段仍由内核那条消息拒绝", async () => {
    const { documentService, postingService } = await createFixture();
    const document = await documentService.create(purchaseInboundInput());

    const failure = await failureOf(postingService.post(document.id, undefined, POSTING_PHASES.IN));

    expect(failure.message).toBe(`单据 ${document.documentNo} 不支持的过账阶段：IN`);
    expect((await documentService.get(document.id)).status).toBe("DRAFT");
  });
});
