import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemoryDocumentRepository } from "./in-memory-repository";
import { DOCUMENT_STATUSES, type Document, type DocumentInput, type DocumentLine } from "./model";
import { createDocumentService } from "./service";

const [DRAFT_STATUS, POSTED_STATUS, VOIDED_STATUS] = DOCUMENT_STATUSES;

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const packagesRoot = path.resolve(import.meta.dirname, "../../../..");

const DOCUMENT_LINE: DocumentLine = {
  id: "line-1",
  lineNo: 1,
  itemId: "item-1",
  quantity: "3.000",
  unitPrice: "1.115000",
  amount: "3.35",
  originalLineId: null,
};

const draftDocument = (): Document => ({
  id: "doc-1",
  documentNo: "PIN-20260102-001",
  type: "PURCHASE_INBOUND",
  status: DRAFT_STATUS,
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [DOCUMENT_LINE],
});

const purchaseInboundInput = (): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: "warehouse-1",
  warehouseId: null,
  lines: [{ itemId: "item-1", quantity: "3", unitPrice: "1.115", amount: null }],
});

describe("单据状态的写入路径", () => {
  it("update() 传入改了状态的单据时，内存适配器不改写库里的状态", async () => {
    const repository = createInMemoryDocumentRepository();
    const document = draftDocument();
    await repository.insert(document);

    await repository.update({ ...document, status: POSTED_STATUS });
    await repository.update({ ...document, status: VOIDED_STATUS });

    const stored = await repository.findById(document.id);
    expect(stored?.status).toBe(DRAFT_STATUS);
  });

  it("update() 仍然写入单据行与其它字段，端口收窄只影响状态", async () => {
    const repository = createInMemoryDocumentRepository();
    const document = draftDocument();
    await repository.insert(document);

    await repository.update({
      ...document,
      supplierId: "supplier-2",
      lines: [{ ...DOCUMENT_LINE, quantity: "9.000" }],
    });

    const stored = await repository.findById(document.id);
    expect(stored?.supplierId).toBe("supplier-2");
    expect(stored?.lines[0]?.quantity).toBe("9.000");
    expect(stored?.status).toBe(DRAFT_STATUS);
  });

  it("update() 对库里不存在的单据不写入，也不写状态", async () => {
    const repository = createInMemoryDocumentRepository();
    const document = draftDocument();

    await repository.update({ ...document, status: POSTED_STATUS });

    expect(await repository.findById(document.id)).toBeNull();
  });

  it("updateStatus 是唯一改变状态的路径：CAS 命中才改状态，from 不匹配时状态不变", async () => {
    const repository = createInMemoryDocumentRepository();
    const document = draftDocument();
    await repository.insert(document);

    const changed = await repository.updateStatus(document.id, DRAFT_STATUS, POSTED_STATUS);
    expect(changed).toBe(true);
    expect((await repository.findById(document.id))?.status).toBe(POSTED_STATUS);

    const rejected = await repository.updateStatus(document.id, DRAFT_STATUS, VOIDED_STATUS);
    expect(rejected).toBe(false);
    expect((await repository.findById(document.id))?.status).toBe(POSTED_STATUS);
  });

  it("服务层改单据后返回的单据与库里的单据都还是草稿", async () => {
    const repository = createInMemoryDocumentRepository();
    let counter = 0;
    const service = createDocumentService(repository, {
      idGenerator: () => `doc-${++counter}`,
      clock: () => FIXED_CLOCK,
      timeZone: "Asia/Shanghai",
    });

    const created = await service.create(purchaseInboundInput());
    const updated = await service.update(created.id, purchaseInboundInput());

    expect(updated.status).toBe(DRAFT_STATUS);
    expect((await repository.findById(created.id))?.status).toBe(DRAFT_STATUS);
  });

  it("Postgres 适配器的 update() 的 SET 子句里没有 status 列", () => {
    const source = readFileSync(
      path.join(packagesRoot, "kernel-pg/src/features/documents/repository.ts"),
      "utf8",
    );

    const applyUpdateStart = source.indexOf("const applyUpdate = async");
    const setClauseStart = source.indexOf(".set({", applyUpdateStart);
    const setClauseEnd = source.indexOf("})", setClauseStart);
    const setClause = source.slice(setClauseStart, setClauseEnd);

    expect(applyUpdateStart).toBeGreaterThan(-1);
    expect(setClauseStart).toBeGreaterThan(applyUpdateStart);
    expect(setClause).toContain("type: document.type");
    expect(setClause).not.toContain("status");
  });
});
