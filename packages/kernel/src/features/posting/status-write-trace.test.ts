import { describe, expect, it } from "vitest";
import type { DocumentType } from "../../shared/document-types";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { Document, DocumentLine, DocumentStatus } from "../documents/model";
import type { DocumentRepository } from "../documents/ports";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
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

type StatusTransition = {
  documentId: string;
  from: DocumentStatus;
  to: DocumentStatus;
};

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

const createFixture = () => {
  const target = createInMemoryDocumentRepository();
  const transitions: StatusTransition[] = [];
  const documents: DocumentRepository = {
    ...target,
    async updateStatus(id, from, to, context) {
      transitions.push({ documentId: id, from, to });
      return target.updateStatus(id, from, to, context);
    },
  };
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
      createStocktakePostingHandler(ledger),
      createTransferPostingHandler(ledger, inTransit),
    ],
  });
  return { target, documents, ledger, inTransit, postingService, transitions };
};

describe("过账的状态更新序列", () => {
  it("采购入库过账只迁移一次 DRAFT 到 POSTED，重复过账幂等短路不再迁移", async () => {
    const fixture = createFixture();
    const document = makeDocument({
      id: "doc-1",
      documentNo: "PIN-20260102-001",
      type: "PURCHASE_INBOUND",
      targetWarehouseId: SOURCE,
      lines: [makeLine("line-1", 1, "item-1", "5", { unitPrice: "2" })],
    });
    await fixture.target.insert(document);

    await fixture.postingService.post(document.id);
    const repeated = await fixture.postingService.post(document.id);

    expect(repeated.status).toBe("POSTED");
    expect(fixture.transitions).toEqual([{ documentId: document.id, from: "DRAFT", to: "POSTED" }]);
  });

  it("销售出库过账只迁移一次 DRAFT 到 POSTED", async () => {
    const fixture = createFixture();
    await fixture.ledger.saveBalance({
      warehouseId: SOURCE,
      itemId: "item-1",
      quantity: "10.000",
      unitCost: "2.000000",
    });
    const document = makeDocument({
      id: "doc-1",
      documentNo: "SOUT-20260102-001",
      type: "SALE_OUTBOUND",
      sourceWarehouseId: SOURCE,
      lines: [makeLine("line-1", 1, "item-1", "4", { unitPrice: "3.5" })],
    });
    await fixture.target.insert(document);

    await fixture.postingService.post(document.id);

    expect(fixture.transitions).toEqual([{ documentId: document.id, from: "DRAFT", to: "POSTED" }]);
  });

  it("销售退货过账只迁移一次 DRAFT 到 POSTED", async () => {
    const fixture = createFixture();
    await fixture.ledger.saveBalance({
      warehouseId: SOURCE,
      itemId: "item-1",
      quantity: "10.000",
      unitCost: "2.000000",
    });
    const outbound = makeDocument({
      id: "doc-out",
      documentNo: "SOUT-20260102-002",
      type: "SALE_OUTBOUND",
      sourceWarehouseId: SOURCE,
      lines: [makeLine("out-line-1", 1, "item-1", "4", { unitPrice: "3.5" })],
    });
    await fixture.target.insert(outbound);
    await fixture.postingService.post(outbound.id);
    fixture.transitions.length = 0;
    const saleReturn = makeDocument({
      id: "doc-1",
      documentNo: "SRET-20260102-001",
      type: "SALE_RETURN",
      sourceWarehouseId: SOURCE,
      lines: [makeLine("ret-line-1", 1, "item-1", "2", { originalLineId: "out-line-1" })],
    });
    await fixture.target.insert(saleReturn);

    await fixture.postingService.post(saleReturn.id);

    expect(fixture.transitions).toEqual([
      { documentId: saleReturn.id, from: "DRAFT", to: "POSTED" },
    ]);
  });

  it("采购退货过账只迁移一次 DRAFT 到 POSTED", async () => {
    const fixture = createFixture();
    const inbound = makeDocument({
      id: "doc-in",
      documentNo: "PIN-20260102-002",
      type: "PURCHASE_INBOUND",
      targetWarehouseId: SOURCE,
      lines: [makeLine("in-line-1", 1, "item-1", "10", { unitPrice: "2" })],
    });
    await fixture.target.insert(inbound);
    await fixture.postingService.post(inbound.id);
    fixture.transitions.length = 0;
    const purchaseReturn = makeDocument({
      id: "doc-1",
      documentNo: "PRET-20260102-001",
      type: "PURCHASE_RETURN",
      sourceWarehouseId: SOURCE,
      lines: [makeLine("ret-line-1", 1, "item-1", "3", { originalLineId: "in-line-1" })],
    });
    await fixture.target.insert(purchaseReturn);

    await fixture.postingService.post(purchaseReturn.id);

    expect(fixture.transitions).toEqual([
      { documentId: purchaseReturn.id, from: "DRAFT", to: "POSTED" },
    ]);
  });

  it("盘点过账只迁移一次 DRAFT 到 POSTED", async () => {
    const fixture = createFixture();
    await fixture.ledger.saveBalance({
      warehouseId: SOURCE,
      itemId: "item-1",
      quantity: "10.000",
      unitCost: "2.000000",
    });
    const document = makeDocument({
      id: "doc-1",
      documentNo: "STK-20260102-001",
      type: "STOCKTAKE",
      warehouseId: SOURCE,
      lines: [makeLine("line-1", 1, "item-1", "12")],
    });
    await fixture.target.insert(document);

    await fixture.postingService.post(document.id);

    expect(fixture.transitions).toEqual([{ documentId: document.id, from: "DRAFT", to: "POSTED" }]);
  });

  it("调拨两阶段合计只迁移一次 DRAFT 到 POSTED，同一阶段重复过账不再迁移", async () => {
    const fixture = createFixture();
    await fixture.ledger.saveBalance({
      warehouseId: SOURCE,
      itemId: "item-1",
      quantity: "10.000",
      unitCost: "2.500000",
    });
    const document = makeDocument({
      id: "doc-1",
      documentNo: "TRF-20260102-001",
      type: "TRANSFER",
      sourceWarehouseId: SOURCE,
      targetWarehouseId: TARGET,
      lines: [makeLine("line-1", 1, "item-1", "4", { unitPrice: "2.5" })],
    });
    await fixture.target.insert(document);

    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.OUT);
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.OUT);
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.IN);
    await fixture.postingService.post(document.id, undefined, TRANSFER_POSTING_PHASES.IN);

    expect(fixture.transitions).toEqual([{ documentId: document.id, from: "DRAFT", to: "POSTED" }]);
  });
});
