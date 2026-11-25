import { describe, expect, it } from "vitest";
import { createInMemoryStockLedgerRepository } from "../inventory/in-memory-repository";
import { createSaleReturnPostingHandler } from "../sales-return/sale-return-posting";
import { createInMemoryDocumentRepository } from "./in-memory-repository";
import type { Document, DocumentLine } from "./model";
import type { DocumentRepository } from "./ports";
import { lockOriginalDocuments } from "./lock-order";

const line = (
  id: string,
  itemId: string,
  originalLineId: string | null = null,
  quantity = "1.000",
): DocumentLine => ({
  id,
  lineNo: 1,
  itemId,
  quantity,
  unitPrice: null,
  amount: null,
  originalLineId,
});

const document = (id: string, lines: DocumentLine[]): Document => ({
  id,
  documentNo: id.toUpperCase(),
  type: "SALE_OUTBOUND",
  status: "POSTED",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: "warehouse-1",
  targetWarehouseId: null,
  warehouseId: null,
  lines,
});

const recording = (
  base: DocumentRepository,
): { repository: DocumentRepository; lockOrder: string[] } => {
  const lockOrder: string[] = [];
  return {
    lockOrder,
    repository: {
      ...base,
      async findByLineIdForUpdate(lineId, context) {
        lockOrder.push(lineId);
        return base.findByLineIdForUpdate(lineId, context);
      },
    },
  };
};

const seed = async (): Promise<DocumentRepository> => {
  const documents = createInMemoryDocumentRepository();
  await documents.insert(document("doc-a", [line("line-a", "item-1")]));
  await documents.insert(document("doc-b", [line("line-b", "item-1")]));
  return documents;
};

describe("多原单据的确定性取锁顺序", () => {
  it("引用行顺序相反时，仍按原单据 id 升序取锁", async () => {
    const documents = await seed();

    const forward = recording(documents);
    const forwardLocked = await lockOriginalDocuments(forward.repository, ["line-a", "line-b"]);
    expect(forward.lockOrder).toEqual(["line-a", "line-b"]);
    expect(forwardLocked.get("line-a")?.id).toBe("doc-a");
    expect(forwardLocked.get("line-b")?.id).toBe("doc-b");

    const backward = recording(documents);
    const backwardLocked = await lockOriginalDocuments(backward.repository, ["line-b", "line-a"]);
    expect(backward.lockOrder).toEqual(["line-a", "line-b"]);
    expect(backwardLocked.get("line-a")?.id).toBe("doc-a");
    expect(backwardLocked.get("line-b")?.id).toBe("doc-b");
  });

  it("同一原单据的多行只取一次锁，并映射到同一份已加锁单据", async () => {
    const documents = createInMemoryDocumentRepository();
    await documents.insert(
      document("doc-a", [line("line-a1", "item-1"), line("line-a2", "item-1")]),
    );

    const recorder = recording(documents);
    const locked = await lockOriginalDocuments(recorder.repository, ["line-a2", "line-a1"]);

    expect(recorder.lockOrder).toEqual(["line-a1"]);
    expect(locked.get("line-a1")?.id).toBe("doc-a");
    expect(locked.get("line-a2")?.id).toBe("doc-a");
  });

  it("引用不存在的行 id 不出现在返回的映射里", async () => {
    const documents = await seed();

    const locked = await lockOriginalDocuments(documents, ["line-a", "missing-line"]);

    expect(locked.has("line-a")).toBe(true);
    expect(locked.has("missing-line")).toBe(false);
  });
});

const saleReturn = (id: string, lines: DocumentLine[]): Document => ({
  id,
  documentNo: id.toUpperCase(),
  type: "SALE_RETURN",
  status: "DRAFT",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: "warehouse-1",
  targetWarehouseId: null,
  warehouseId: null,
  lines,
});

describe("销售退货过账走有序取锁", () => {
  it("退货单的行顺序相反时，两次过账校验的取锁顺序一致且按原单据 id 升序", async () => {
    const documents = createInMemoryDocumentRepository();
    await documents.insert(document("doc-a", [line("line-a", "item-1")]));
    await documents.insert(document("doc-b", [line("line-b", "item-1")]));
    const ledger = createInMemoryStockLedgerRepository();
    const recorder = recording(documents);
    const handler = createSaleReturnPostingHandler(ledger, recorder.repository);

    const forward = saleReturn("return-forward", [
      line("return-forward-1", "item-1", "line-a", "2.000"),
      line("return-forward-2", "item-1", "line-b", "2.000"),
    ]);
    await handler.validate(forward, "FORWARD", undefined);
    const forwardOrder = [...recorder.lockOrder];

    recorder.lockOrder.length = 0;
    const backward = saleReturn("return-backward", [
      line("return-backward-1", "item-1", "line-b", "2.000"),
      line("return-backward-2", "item-1", "line-a", "2.000"),
    ]);
    await handler.validate(backward, "FORWARD", undefined);

    expect(forwardOrder).toEqual(["line-a", "line-b"]);
    expect(recorder.lockOrder).toEqual(forwardOrder);
  });
});
