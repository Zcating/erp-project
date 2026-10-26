import { describe, expect, it } from "vitest";
import { StateConflictError } from "../../shared/errors/index.js";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions/index.js";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository.js";
import type { DocumentInput } from "../documents/model.js";
import { createDocumentService } from "../documents/service.js";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository.js";
import type { StockLedgerRepository } from "../inventory/ports.js";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting.js";
import { createPostingService } from "./service.js";

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const createFixture = async (options: { runner?: TransactionRunner } = {}) => {
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
    ...(options.runner === undefined ? {} : { runner: options.runner }),
  });
  return { documents, ledger, documentService, postingService };
};

const purchaseInboundInput = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId: "item-1", quantity: "12", unitPrice: "1.115", amount: null }],
  ...overrides,
});

describe("过账框架的状态流转守卫与幂等", () => {
  it("对同一张已过账的采购入库单连续发两次过账请求，第二次仍然成功且库存、流水条数与加权平均成本都不变", async () => {
    const { ledger, documentService, postingService } = await createFixture();
    const document = await documentService.create(purchaseInboundInput());

    const first = await postingService.post(document.id);
    const second = await postingService.post(document.id);

    expect(first.status).toBe("POSTED");
    expect(second.status).toBe("POSTED");
    const balance = await ledger.findBalance("warehouse-1", "item-1");
    expect(balance?.quantity).toBe("12.000");
    expect(balance?.unitCost).toBe("1.115000");
    expect(await ledger.listEntriesByDocumentNo(document.documentNo)).toHaveLength(1);
  });

  it("已过账单据的行与单据头修改请求被拒绝", async () => {
    const { documentService, postingService } = await createFixture();
    const document = await documentService.create(purchaseInboundInput());
    await postingService.post(document.id);

    await expect(
      documentService.update(document.id, purchaseInboundInput({ supplierId: "supplier-2" })),
    ).rejects.toThrow(StateConflictError);
    await expect(
      documentService.update(
        document.id,
        purchaseInboundInput({
          lines: [{ itemId: "item-1", quantity: "13", unitPrice: "1.115", amount: null }],
        }),
      ),
    ).rejects.toThrow("单据不是草稿状态");
    await expect(documentService.remove(document.id)).rejects.toThrow("单据不是草稿状态");
  });

  it("已作废单据再次作废被拒绝", async () => {
    const { documentService, postingService } = await createFixture();
    const document = await documentService.create(purchaseInboundInput());
    await postingService.post(document.id);
    await postingService.void(document.id);

    await expect(postingService.void(document.id)).rejects.toThrow(StateConflictError);
    await expect(postingService.void(document.id)).rejects.toThrow(
      "单据状态不能从已作废变为已作废",
    );
  });

  it("已作废单据不能再过账", async () => {
    const { documentService, postingService } = await createFixture();
    const document = await documentService.create(purchaseInboundInput());
    await postingService.post(document.id);
    await postingService.void(document.id);

    await expect(postingService.post(document.id)).rejects.toThrow(
      "单据状态不能从已作废变为已过账",
    );
  });

  it("作废已过账单据时，为该单的每一次库存变动各追加一条数量相反的反向流水", async () => {
    const { ledger, documentService, postingService } = await createFixture();
    const document = await documentService.create(
      purchaseInboundInput({
        lines: [
          { itemId: "item-1", quantity: "3", unitPrice: "1.115", amount: null },
          { itemId: "item-1", quantity: "4", unitPrice: "2", amount: null },
        ],
      }),
    );
    await postingService.post(document.id);

    await postingService.void(document.id);

    const entries = await ledger.listEntriesByDocumentNo(document.documentNo);
    expect(entries).toHaveLength(4);
    expect(entries.filter((entry) => entry.direction === "POST")).toHaveLength(2);
    const reversals = entries.filter((entry) => entry.direction === "REVERSAL");
    expect(reversals).toHaveLength(2);
    expect(reversals.map((entry) => entry.lineNo)).toEqual([1, 2]);
    expect(reversals[0]?.quantityBefore).toBe("3.000");
    expect(reversals[0]?.quantityAfter).toBe("0.000");
    expect(reversals[1]?.quantityBefore).toBe("7.000");
    expect(reversals[1]?.quantityAfter).toBe("3.000");
  });

  it("作废保留原流水与原单据，不做物理删除", async () => {
    const { ledger, documentService, postingService } = await createFixture();
    const document = await documentService.create(purchaseInboundInput());
    await postingService.post(document.id);

    const voided = await postingService.void(document.id);

    expect(voided.status).toBe("VOIDED");
    expect(voided.documentNo).toBe(document.documentNo);
    expect(await ledger.listEntriesByDocumentNo(document.documentNo)).toHaveLength(2);
    expect(await documentService.get(document.id)).toBeDefined();
  });

  it("过账在单个事务内完成：事务运行器只开一次事务，事务上下文一路传到库存端口", async () => {
    const contexts: Array<TransactionContext | undefined> = [];
    let runCount = 0;
    const runner: TransactionRunner = {
      async run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
        runCount += 1;
        return work({ transactionId: "tx-1", handle: "tx-handle" });
      },
    };
    const documents = createInMemoryDocumentRepository();
    const ledger = createInMemoryStockLedgerRepository();
    const recordingLedger: StockLedgerRepository = {
      ...ledger,
      async saveBalance(balance, context) {
        contexts.push(context);
        await ledger.saveBalance(balance, context);
      },
      async appendEntries(entries, context) {
        contexts.push(context);
        await ledger.appendEntries(entries, context);
      },
    };
    const documentService = createDocumentService(documents, { clock: () => FIXED_CLOCK });
    const postingService = createPostingService({
      documents,
      ledger: recordingLedger,
      handlers: [createPurchaseInboundPostingHandler(recordingLedger)],
      runner,
    });
    const document = await documentService.create(purchaseInboundInput());

    await postingService.post(document.id);

    expect(runCount).toBe(1);
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts.every((context) => context?.transactionId === "tx-1")).toBe(true);
  });
});
