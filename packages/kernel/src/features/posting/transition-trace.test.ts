import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TransactionContext } from "../../shared/transactions";
import { createInMemoryDocumentRepository } from "../documents/in-memory-repository";
import type { Document, DocumentInput, DocumentStatus } from "../documents/model";
import type { DocumentRepository } from "../documents/ports";
import { createDocumentService } from "../documents/service";
import { DOCUMENT_STATUS_TRANSITIONS } from "../documents/state-machine";
import { createInMemoryItemMasterRepository } from "../item-master/in-memory-repository";
import { createItemMasterService } from "../item-master/service";
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

const FIXED_CLOCK = new Date("2026-01-02T03:04:05Z");

const WAREHOUSE = "warehouse-1";
const TARGET_WAREHOUSE = "warehouse-2";

type ObservedTransition = {
  documentId: string;
  from: DocumentStatus;
  to: DocumentStatus;
};

type ObservedUpdate = {
  documentId: string;
  before: DocumentStatus | null;
  after: DocumentStatus;
};

type TransitionRecorder = {
  repository: DocumentRepository;
  transitions: ObservedTransition[];
  updates: ObservedUpdate[];
};

const createTransitionRecorder = (target: DocumentRepository): TransitionRecorder => {
  const transitions: ObservedTransition[] = [];
  const updates: ObservedUpdate[] = [];
  const repository = new Proxy(target, {
    get(inner, property) {
      const value = Reflect.get(inner, property) as unknown;
      if (typeof value !== "function") {
        return value;
      }
      const method = value as (...args: unknown[]) => unknown;
      if (property === "updateStatus") {
        return async (
          documentId: string,
          from: DocumentStatus,
          to: DocumentStatus,
          context?: TransactionContext,
        ): Promise<boolean> => {
          transitions.push({ documentId, from, to });
          return method.call(target, documentId, from, to, context) as Promise<boolean>;
        };
      }
      if (property === "update") {
        return async (document: Document, context?: TransactionContext): Promise<void> => {
          const existing = await target.findById(document.id, context);
          updates.push({
            documentId: document.id,
            before: existing?.status ?? null,
            after: document.status,
          });
          await method.call(target, document, context);
        };
      }
      return method.bind(target);
    },
  });
  return { repository, transitions, updates };
};

const createFixture = async () => {
  const store = createInMemoryDocumentRepository();
  const recorder = createTransitionRecorder(store);
  const ledger = createInMemoryStockLedgerRepository();
  const inTransit = createInMemoryTransferInTransitRepository();
  const items = createInMemoryItemMasterRepository();
  const itemService = createItemMasterService(items);
  let counter = 0;
  const documentService = createDocumentService(recorder.repository, {
    idGenerator: () => `doc-${++counter}`,
    clock: () => FIXED_CLOCK,
    timeZone: "Asia/Shanghai",
    itemLookup: items,
  });
  const postingService = createPostingService({
    documents: recorder.repository,
    ledger,
    handlers: [
      createPurchaseInboundPostingHandler(ledger),
      createSaleOutboundPostingHandler(ledger),
      createSaleReturnPostingHandler(ledger, recorder.repository),
      createPurchaseReturnPostingHandler(ledger, recorder.repository),
      createStocktakePostingHandler(ledger),
      createTransferPostingHandler(ledger, inTransit),
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
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  });
  return { ...recorder, documentService, ledger, postingService, item };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const purchaseInboundInput = (
  itemId: string,
  quantity: string,
  unitPrice: string,
): DocumentInput => ({
  type: "PURCHASE_INBOUND",
  supplierId: "supplier-1",
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: WAREHOUSE,
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice, amount: null }],
});

const saleOutboundInput = (itemId: string, quantity: string): DocumentInput => ({
  type: "SALE_OUTBOUND",
  supplierId: null,
  customerId: "customer-1",
  sourceWarehouseId: WAREHOUSE,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice: "3.5", amount: null }],
});

const saleReturnInput = (originalLineId: string, quantity: string): DocumentInput => ({
  type: "SALE_RETURN",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId: "ignored", quantity, unitPrice: null, amount: null, originalLineId }],
});

const purchaseReturnInput = (originalLineId: string, quantity: string): DocumentInput => ({
  type: "PURCHASE_RETURN",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId: "ignored", quantity, unitPrice: null, amount: null, originalLineId }],
});

const stocktakeInput = (itemId: string, quantity: string): DocumentInput => ({
  type: "STOCKTAKE",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: WAREHOUSE,
  lines: [{ itemId, quantity, unitPrice: null, amount: null }],
});

const transferInput = (itemId: string, quantity: string): DocumentInput => ({
  type: "TRANSFER",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: WAREHOUSE,
  targetWarehouseId: TARGET_WAREHOUSE,
  warehouseId: null,
  lines: [{ itemId, quantity, unitPrice: "2.5", amount: null }],
});

const lineIdOf = (document: Document): string => {
  const lineId = document.lines[0]?.id;
  if (lineId === undefined) {
    throw new Error(`单据 ${document.documentNo} 没有单据行`);
  }
  return lineId;
};

const runRepresentativeSequence = async (fixture: Fixture): Promise<Map<string, Document>> => {
  const documents = new Map<string, Document>();
  const track = (document: Document): Document => {
    documents.set(document.id, document);
    return document;
  };

  const seed = track(
    await fixture.documentService.create(purchaseInboundInput(fixture.item.id, "100", "2")),
  );
  await fixture.postingService.post(seed.id);

  const inbound = track(
    await fixture.documentService.create(purchaseInboundInput(fixture.item.id, "10", "2")),
  );
  await fixture.postingService.post(inbound.id);
  await fixture.postingService.void(inbound.id);

  const outbound = track(
    await fixture.documentService.create(saleOutboundInput(fixture.item.id, "5")),
  );
  await fixture.postingService.post(outbound.id);
  await fixture.postingService.void(outbound.id);

  const referenced = track(
    await fixture.documentService.create(saleOutboundInput(fixture.item.id, "5")),
  );
  await fixture.postingService.post(referenced.id);

  const saleReturn = track(
    await fixture.documentService.create(saleReturnInput(lineIdOf(referenced), "2")),
  );
  await fixture.postingService.post(saleReturn.id);
  await fixture.postingService.void(saleReturn.id);

  const purchaseReturn = track(
    await fixture.documentService.create(purchaseReturnInput(lineIdOf(seed), "2")),
  );
  await fixture.postingService.post(purchaseReturn.id);
  await fixture.postingService.void(purchaseReturn.id);

  const stocktake = track(
    await fixture.documentService.create(stocktakeInput(fixture.item.id, "90")),
  );
  await fixture.documentService.update(stocktake.id, stocktakeInput(fixture.item.id, "91"));
  await fixture.postingService.post(stocktake.id);
  await fixture.postingService.void(stocktake.id);

  const transfer = track(await fixture.documentService.create(transferInput(fixture.item.id, "2")));
  await fixture.postingService.post(transfer.id, undefined, TRANSFER_POSTING_PHASES.OUT);
  await fixture.postingService.post(transfer.id, undefined, TRANSFER_POSTING_PHASES.IN);
  await fixture.postingService.void(transfer.id);

  return documents;
};

const declaredEdges = (): string[] =>
  Object.entries(DOCUMENT_STATUS_TRANSITIONS).flatMap(([from, targets]) =>
    targets.map((to) => `${from}->${to}`),
  );

const collectSourceFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.(test|e2e|pw)\.tsx?$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
};

describe("单据状态迁移轨迹检查器", () => {
  it("真实过账与作废序列产出的每一条迁移都在声明表内，不存在声明表之外的迁移", async () => {
    const fixture = await createFixture();
    await runRepresentativeSequence(fixture);

    const declared = new Set(declaredEdges());
    const observed = fixture.transitions.map(
      (transition) => `${transition.from}->${transition.to}`,
    );
    const outside = [...new Set(observed)].filter((edge) => !declared.has(edge)).sort();

    expect(outside).toEqual([]);
    expect(fixture.transitions.length).toBeGreaterThan(0);
  });

  it("声明表里的每一条边都被真实触达：覆盖不足时这条断言变红", async () => {
    const fixture = await createFixture();
    await runRepresentativeSequence(fixture);

    const declared = new Set(declaredEdges());
    const observed = new Set(
      fixture.transitions.map((transition) => `${transition.from}->${transition.to}`),
    );
    const missing = [...declared].filter((edge) => !observed.has(edge)).sort();

    expect(missing).toEqual([]);
    expect([...observed].sort()).toEqual([...declared].sort());
  });

  it("轨迹覆盖六类单据的过账与作废，以及调拨单的调出与调入", async () => {
    const fixture = await createFixture();
    const documents = await runRepresentativeSequence(fixture);

    const typeOf = (transition: ObservedTransition): string | undefined =>
      documents.get(transition.documentId)?.type;

    const postedTypes = new Set(
      fixture.transitions
        .filter((transition) => transition.from === "DRAFT" && transition.to === "POSTED")
        .map((transition) => typeOf(transition))
        .filter((type): type is string => type !== undefined),
    );
    const voidedTypes = new Set(
      fixture.transitions
        .filter((transition) => transition.from === "POSTED" && transition.to === "VOIDED")
        .map((transition) => typeOf(transition))
        .filter((type): type is string => type !== undefined),
    );

    expect([...postedTypes].sort((left, right) => left.localeCompare(right))).toEqual([
      "PURCHASE_INBOUND",
      "PURCHASE_RETURN",
      "SALE_OUTBOUND",
      "SALE_RETURN",
      "STOCKTAKE",
      "TRANSFER",
    ]);
    expect([...voidedTypes].sort((left, right) => left.localeCompare(right))).toEqual([
      "PURCHASE_INBOUND",
      "PURCHASE_RETURN",
      "SALE_OUTBOUND",
      "SALE_RETURN",
      "STOCKTAKE",
      "TRANSFER",
    ]);
  });

  it("整段操作序列里没有任何 update() 改动过单据状态", async () => {
    const fixture = await createFixture();
    await runRepresentativeSequence(fixture);

    expect(fixture.updates.length).toBeGreaterThan(0);
    expect(fixture.updates.filter((update) => update.before !== update.after)).toEqual([]);
  });

  it("记录器是测试资产：内核与 Postgres 适配器的生产代码里没有迁移轨迹记录器", () => {
    const packagesRoot = path.resolve(import.meta.dirname, "../../../..");
    const kernelRoot = path.join(packagesRoot, "kernel", "src");
    const roots = [kernelRoot, path.join(packagesRoot, "kernel-pg", "src")];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of collectSourceFiles(root)) {
        if (readFileSync(file, "utf8").includes("TransitionRecorder")) {
          offenders.push(path.relative(kernelRoot, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
