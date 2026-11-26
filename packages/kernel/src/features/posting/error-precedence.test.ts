import { describe, expect, it } from "vitest";
import type { DocumentType } from "../../shared/document-types";
import { StateConflictError, ValidationError } from "../../shared/errors";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { Document, DocumentLine } from "../documents/model";
import type { DocumentRepository } from "../documents/ports";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
import { createPurchaseReturnPostingHandler } from "../purchase-return/purchase-return-posting";
import { createPurchaseInboundPostingHandler } from "../purchasing/purchase-inbound-posting";
import { createSaleReturnPostingHandler } from "../sales-return/sale-return-posting";
import { createSaleOutboundPostingHandler } from "../selling/sale-outbound-posting";
import { createInMemoryTransferInTransitRepository } from "../transfer/in-memory-repository";
import { createTransferPostingHandler } from "../transfer/posting";
import type { PostingPhase } from "./model";
import { createPostingService } from "./service";

const WAREHOUSE = "warehouse-1";

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

const failureOf = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("预期抛出错误，但调用成功返回");
};

const createFullFixture = (documents: DocumentRepository = createInMemoryDocumentRepository()) => {
  const ledger = createInMemoryStockLedgerRepository();
  const inTransit = createInMemoryTransferInTransitRepository();
  const postingService = createPostingService({
    documents,
    ledger,
    handlers: [
      createPurchaseInboundPostingHandler(ledger),
      createSaleOutboundPostingHandler(ledger),
      createSaleReturnPostingHandler(ledger, documents),
      createPurchaseReturnPostingHandler(ledger, documents),
      createTransferPostingHandler(ledger, inTransit),
    ],
  });
  return { documents, ledger, postingService };
};

describe("过账错误优先级", () => {
  it("已作废单据缺少仓库时先报状态迁移错误，不报缺仓库", async () => {
    const documents = createInMemoryDocumentRepository();
    const { ledger, postingService } = createFullFixture(documents);
    const document = makeDocument({
      id: "doc-1",
      documentNo: "PIN-20260102-001",
      type: "PURCHASE_INBOUND",
      status: "VOIDED",
      targetWarehouseId: null,
      lines: [makeLine("line-1", 1, "item-1", "5", { unitPrice: "2" })],
    });
    await documents.insert(document);

    const failure = await failureOf(postingService.post(document.id));

    expect(failure).toBeInstanceOf(StateConflictError);
    expect(failure.message).toBe("单据状态不能从已作废变为已过账");
    expect(await ledger.listEntriesByDocument(document.id)).toEqual([]);
  });

  it("已过账单据带非法阶段时先报不支持的过账阶段，不幂等返回", async () => {
    const documents = createInMemoryDocumentRepository();
    const { postingService } = createFullFixture(documents);
    const document = makeDocument({
      id: "doc-1",
      documentNo: "PIN-20260102-002",
      type: "PURCHASE_INBOUND",
      status: "POSTED",
      targetWarehouseId: WAREHOUSE,
      lines: [makeLine("line-1", 1, "item-1", "5", { unitPrice: "2" })],
    });
    await documents.insert(document);

    const failure = await failureOf(
      postingService.post(document.id, undefined, "OUT" as PostingPhase),
    );

    expect(failure).toBeInstanceOf(ValidationError);
    expect(failure.message).toBe(`单据 ${document.documentNo} 不支持的过账阶段：OUT`);
  });

  it("已作废单据且单据类型未注册时 void 先报状态迁移错误，不报类型不支持", async () => {
    const documents = createInMemoryDocumentRepository();
    const ledger = createInMemoryStockLedgerRepository();
    const postingService = createPostingService({ documents, ledger, handlers: [] });
    const document = makeDocument({
      id: "doc-1",
      documentNo: "SOUT-20260102-001",
      type: "SALE_OUTBOUND",
      status: "VOIDED",
      sourceWarehouseId: WAREHOUSE,
      lines: [makeLine("line-1", 1, "item-1", "5", { unitPrice: "3.5" })],
    });
    await documents.insert(document);

    const failure = await failureOf(postingService.void(document.id));

    expect(failure).toBeInstanceOf(StateConflictError);
    expect(failure.message).toBe("单据状态不能从已作废变为已作废");
  });

  it("作废被已过账退货单引用且会致负库存的入库单时先报退货单引用", async () => {
    const documents = createInMemoryDocumentRepository();
    const { ledger, postingService } = createFullFixture(documents);
    const inbound = makeDocument({
      id: "doc-1",
      documentNo: "PIN-20260102-003",
      type: "PURCHASE_INBOUND",
      targetWarehouseId: WAREHOUSE,
      lines: [makeLine("in-line-1", 1, "item-1", "10", { unitPrice: "2" })],
    });
    await documents.insert(inbound);
    await postingService.post(inbound.id);
    const purchaseReturn = makeDocument({
      id: "doc-2",
      documentNo: "PRET-20260102-001",
      type: "PURCHASE_RETURN",
      sourceWarehouseId: WAREHOUSE,
      lines: [makeLine("ret-line-1", 1, "item-1", "4", { originalLineId: "in-line-1" })],
    });
    await documents.insert(purchaseReturn);
    await postingService.post(purchaseReturn.id);

    const failure = await failureOf(postingService.void(inbound.id));

    expect(failure).toBeInstanceOf(StateConflictError);
    expect(failure.message).toBe(
      `单据 ${inbound.documentNo} 已被过账的退货单引用：${purchaseReturn.documentNo}，请先作废退货单 ${purchaseReturn.documentNo}`,
    );
    expect((await ledger.findBalance(WAREHOUSE, "item-1"))?.quantity).toBe("6.000");
    expect((await documents.findById(inbound.id))?.status).toBe("POSTED");
  });

  it("退货单作废不锁原单也不校验原行引用", async () => {
    const target = createInMemoryDocumentRepository();
    const lockCalls: string[] = [];
    const documents: DocumentRepository = {
      ...target,
      async findDocumentIdsByLineIds(lineIds, context) {
        lockCalls.push("findDocumentIdsByLineIds");
        return target.findDocumentIdsByLineIds(lineIds, context);
      },
      async findByLineId(lineId, context) {
        lockCalls.push("findByLineId");
        return target.findByLineId(lineId, context);
      },
      async findByLineIdForUpdate(lineId, context) {
        lockCalls.push("findByLineIdForUpdate");
        return target.findByLineIdForUpdate(lineId, context);
      },
    };
    const { ledger, postingService } = createFullFixture(documents);
    const saleReturn = makeDocument({
      id: "doc-1",
      documentNo: "SRET-20260102-001",
      type: "SALE_RETURN",
      status: "POSTED",
      sourceWarehouseId: WAREHOUSE,
      lines: [makeLine("ret-line-1", 1, "item-1", "2", { originalLineId: "missing-line-1" })],
    });
    await target.insert(saleReturn);
    await ledger.saveBalance({
      warehouseId: WAREHOUSE,
      itemId: "item-1",
      quantity: "2.000",
      unitCost: "3.500000",
    });
    await ledger.appendEntries([
      {
        documentId: saleReturn.id,
        documentNo: saleReturn.documentNo,
        lineNo: 1,
        warehouseId: WAREHOUSE,
        itemId: "item-1",
        direction: "POST",
        quantityBefore: "0.000",
        quantityAfter: "2.000",
        costBefore: "3.500000",
        costAfter: "3.500000",
        unitPrice: "3.500000",
        amount: "7.00",
      },
    ]);

    const voided = await postingService.void(saleReturn.id);

    expect(voided.status).toBe("VOIDED");
    expect(lockCalls).toEqual([]);
    expect((await ledger.findBalance(WAREHOUSE, "item-1"))?.quantity).toBe("0.000");
    const entries = await ledger.listEntriesByDocument(saleReturn.id);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      direction: "REVERSAL",
      quantityBefore: "2.000",
      quantityAfter: "0.000",
      unitPrice: "3.500000",
      amount: "-7.00",
    });
  });
});
