import { QUANTITY_SCALE, quantity, toFixedString } from "@erp-project/shared";
import type { DocumentType } from "../../shared/document-types";
import {
  NotFoundError,
  StateConflictError,
  StockNegativeError,
  ValidationError,
} from "../../shared/errors";
import type { TransactionContext } from "../../shared/transactions";
import {
  assertDocumentStatusTransition,
  DRAFT_DOCUMENT_STATUS,
  POSTED_DOCUMENT_STATUS,
  VOIDED_DOCUMENT_STATUS,
} from "../documents";
import type { Document, DocumentRepository } from "../documents";
import type {
  StockBalance,
  StockBalanceKey,
  StockLedgerEntry,
  StockLedgerRepository,
} from "../inventory";
import type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingTypeHandler,
} from "./model";
import { DEFAULT_POSTING_PHASE, isPostingPhase } from "./model";
import { POSTING_PHASE_SEQUENCES } from "./phases";
import { assertPostingPrerequisites } from "./prerequisites";
import { reverseDocumentPostings } from "./reversal";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

export function balanceKey(key: StockBalanceKey): string {
  return `${key.warehouseId}::${key.itemId}`;
}

export function uniqueKeys(keys: StockBalanceKey[]): StockBalanceKey[] {
  const seen = new Set<string>();
  const result: StockBalanceKey[] = [];
  for (const key of keys) {
    const identifier = balanceKey(key);
    if (seen.has(identifier)) {
      continue;
    }
    seen.add(identifier);
    result.push(key);
  }
  return result;
}

export function emptyBalance(key: StockBalanceKey): StockBalance {
  return {
    warehouseId: key.warehouseId,
    itemId: key.itemId,
    quantity: EMPTY_QUANTITY,
    unitCost: EMPTY_UNIT_COST,
  };
}

export function buildLedgerEntries(
  document: Document,
  movements: InventoryMovement[],
  direction: PostingDirection,
): StockLedgerEntry[] {
  return movements.map((movement) => ({
    documentId: document.id,
    documentNo: document.documentNo,
    lineNo: movement.lineNo,
    warehouseId: movement.warehouseId,
    itemId: movement.itemId,
    direction: direction === "FORWARD" ? "POST" : "REVERSAL",
    quantityBefore: movement.quantityBefore,
    quantityAfter: movement.quantityAfter,
    costBefore: movement.costBefore,
    costAfter: movement.costAfter,
    unitPrice: movement.unitPrice,
    amount: movement.amount,
  }));
}

export async function reverseMovements(
  document: Document,
  ledger: StockLedgerRepository,
  transaction: TransactionContext | undefined,
): Promise<InventoryMovement[]> {
  const movements = await reverseDocumentPostings(document.id, ledger, transaction);
  return movements.sort((left, right) => left.lineNo - right.lineNo);
}

export type PostingOrchestrationOptions = {
  documents: DocumentRepository;
  ledger: StockLedgerRepository;
  handlers: ReadonlyMap<DocumentType, PostingTypeHandler>;
};

export type PostingOrchestration = {
  post(documentId: string, context?: TransactionContext, phase?: PostingPhase): Promise<Document>;
  void(documentId: string, context?: TransactionContext): Promise<Document>;
};

export function createPostingOrchestration(
  options: PostingOrchestrationOptions,
): PostingOrchestration {
  const { documents, ledger, handlers } = options;

  const handlerOf = (document: Document): PostingTypeHandler => {
    const handler = handlers.get(document.type);
    if (handler === undefined) {
      throw new StateConflictError(`单据类型暂不支持过账：${document.type}`);
    }
    return handler;
  };

  const load = async (
    documentId: string,
    context: TransactionContext | undefined,
  ): Promise<Document> => {
    const document = await documents.findByIdForUpdate(documentId, context);
    if (document === null) {
      throw new NotFoundError(`单据不存在：${documentId}`);
    }
    return document;
  };

  const appendLedger = async (
    document: Document,
    movements: InventoryMovement[],
    direction: PostingDirection,
    context: TransactionContext | undefined,
  ): Promise<void> => {
    const entries = await handlerOf(document).buildLedger(document, movements, direction);
    if (entries.length > 0) {
      await ledger.appendEntries(entries, context);
    }
  };

  const assertVoidKeepsStockNonNegative = async (
    document: Document,
    context: TransactionContext | undefined,
  ): Promise<void> => {
    const entries = await ledger.listEntriesByDocument(document.id, context);
    const posted = entries.filter((entry) => entry.direction === "POST");
    const groups = new Map<string, StockLedgerEntry[]>();
    for (const entry of posted) {
      const key = `${entry.warehouseId}::${entry.itemId}`;
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, [entry]);
        continue;
      }
      group.push(entry);
    }
    const risky = [...groups.values()].filter((group) =>
      group.some((entry) =>
        quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore)).isPositive(),
      ),
    );
    if (risky.length === 0) {
      return;
    }
    const keys = risky.map((group) => ({
      warehouseId: (group[0] as StockLedgerEntry).warehouseId,
      itemId: (group[0] as StockLedgerEntry).itemId,
    }));
    const locked = await ledger.findBalancesForUpdate(keys, context);
    for (const group of risky) {
      const first = group[0] as StockLedgerEntry;
      const balance = locked.find(
        (candidate) =>
          candidate.warehouseId === first.warehouseId && candidate.itemId === first.itemId,
      );
      let current = balance?.quantity ?? "0.000";
      for (const entry of [...group].reverse()) {
        const delta = quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore));
        const next = quantity(current).minus(delta);
        if (next.isNegative()) {
          throw new StockNegativeError(
            `作废单据 ${document.documentNo} 会使仓库 ${first.warehouseId} 的商品 ${first.itemId} 账面库存变为 ${toFixedString(next, QUANTITY_SCALE)}，库存不足，禁止负库存`,
          );
        }
        current = toFixedString(next, QUANTITY_SCALE);
      }
    }
  };

  const assertNotReferencedByPostedReturn = async (
    document: Document,
    context: TransactionContext | undefined,
  ): Promise<void> => {
    const references = await documents.listPostedReturnReferences(document.id, context);
    const reference = references[0];
    if (reference === undefined) {
      return;
    }
    throw new StateConflictError(
      `单据 ${document.documentNo} 已被过账的退货单引用：${reference.documentNo}，请先作废退货单 ${reference.documentNo}`,
    );
  };

  const post = async (
    documentId: string,
    context: TransactionContext | undefined,
    requestedPhase: PostingPhase | undefined,
  ): Promise<Document> => {
    const document = await load(documentId, context);
    const handler = handlerOf(document);
    const phaseHandler = handler.phaseHandler;
    const phase: string = requestedPhase ?? DEFAULT_POSTING_PHASE;
    const supportedPhases = phaseHandler?.phases ?? POSTING_PHASE_SEQUENCES[document.type];
    if (!isPostingPhase(phase) || !supportedPhases.includes(phase)) {
      throw new ValidationError(`单据 ${document.documentNo} 不支持的过账阶段：${phase}`);
    }

    if (phaseHandler === undefined) {
      if (document.status === POSTED_DOCUMENT_STATUS) {
        return document;
      }
      assertDocumentStatusTransition(document.status, POSTED_DOCUMENT_STATUS);
      assertPostingPrerequisites(document);
      await handler.validate(document, "FORWARD", context);
      const movements = await handler.applyInventory(document, "FORWARD", context);
      await appendLedger(document, movements, "FORWARD", context);
      const changed = await documents.updateStatus(
        documentId,
        DRAFT_DOCUMENT_STATUS,
        POSTED_DOCUMENT_STATUS,
        context,
      );
      if (!changed) {
        throw new StateConflictError(`单据状态已变更，无法过账：${document.documentNo}`);
      }
      return { ...document, status: POSTED_DOCUMENT_STATUS };
    }

    if (await phaseHandler.isPosted(document, phase, context)) {
      return document;
    }
    if (document.status !== POSTED_DOCUMENT_STATUS) {
      assertDocumentStatusTransition(document.status, POSTED_DOCUMENT_STATUS);
    }
    await phaseHandler.validate(document, phase, context);
    const movements = await phaseHandler.apply(document, phase, context);
    await appendLedger(document, movements, "FORWARD", context);
    if (document.status === POSTED_DOCUMENT_STATUS) {
      return document;
    }
    const changed = await documents.updateStatus(
      documentId,
      DRAFT_DOCUMENT_STATUS,
      POSTED_DOCUMENT_STATUS,
      context,
    );
    if (!changed) {
      throw new StateConflictError(`单据状态已变更，无法过账：${document.documentNo}`);
    }
    return { ...document, status: POSTED_DOCUMENT_STATUS };
  };

  const voidDocument = async (
    documentId: string,
    context: TransactionContext | undefined,
  ): Promise<Document> => {
    const document = await load(documentId, context);
    assertDocumentStatusTransition(document.status, VOIDED_DOCUMENT_STATUS);
    await assertNotReferencedByPostedReturn(document, context);
    await assertVoidKeepsStockNonNegative(document, context);
    const handler = handlerOf(document);
    const phaseHandler = handler.phaseHandler;
    let movements: InventoryMovement[];
    if (phaseHandler === undefined) {
      assertPostingPrerequisites(document);
      await handler.validate(document, "REVERSE", context);
      movements = await handler.applyInventory(document, "REVERSE", context);
    } else {
      movements = await phaseHandler.reverse(document, context);
    }
    await appendLedger(document, movements, "REVERSE", context);
    const changed = await documents.updateStatus(
      documentId,
      POSTED_DOCUMENT_STATUS,
      VOIDED_DOCUMENT_STATUS,
      context,
    );
    if (!changed) {
      throw new StateConflictError(`单据状态已变更，无法作废：${document.documentNo}`);
    }
    return { ...document, status: VOIDED_DOCUMENT_STATUS };
  };

  return {
    post: async (documentId, context, phase) => post(documentId, context, phase),
    void: async (documentId, context) => voidDocument(documentId, context),
  };
}
