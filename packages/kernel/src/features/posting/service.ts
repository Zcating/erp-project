import { QUANTITY_SCALE, quantity, toFixedString } from "@erp-project/shared";
import {
  NotFoundError,
  StateConflictError,
  StockNegativeError,
  ValidationError,
} from "../../shared/errors";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions";
import {
  assertDocumentStatusTransition,
  POSTED_DOCUMENT_STATUS,
  VOIDED_DOCUMENT_STATUS,
} from "../documents";
import type { Document, DocumentRepository } from "../documents";
import type { StockLedgerEntry, StockLedgerRepository } from "../inventory";
import type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingTypeHandler,
} from "./model";
import { DEFAULT_POSTING_PHASE, isPostingPhase } from "./model";
import { POSTING_PHASE_SEQUENCES } from "./phases";

export type PostingService = {
  post(documentId: string, context?: TransactionContext, phase?: PostingPhase): Promise<Document>;
  void(documentId: string, context?: TransactionContext): Promise<Document>;
};

export type PostingServiceOptions = {
  documents: DocumentRepository;
  ledger: StockLedgerRepository;
  handlers: PostingTypeHandler[];
  runner?: TransactionRunner;
};

export function createPostingService(options: PostingServiceOptions): PostingService {
  const { documents, ledger, runner } = options;
  const handlers = new Map(options.handlers.map((handler) => [handler.type, handler]));

  const inTransaction = async <T>(
    context: TransactionContext | undefined,
    work: (context: TransactionContext | undefined) => Promise<T>,
  ): Promise<T> => {
    if (context !== undefined || runner === undefined) {
      return work(context);
    }
    return runner.run((outer) => work(outer));
  };

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

  return {
    async post(
      documentId: string,
      context?: TransactionContext,
      requestedPhase?: PostingPhase,
    ): Promise<Document> {
      return inTransaction(context, async (transaction) => {
        const document = await load(documentId, transaction);
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
          await handler.validate(document, "FORWARD", transaction);
          const movements = await handler.applyInventory(document, "FORWARD", transaction);
          await appendLedger(document, movements, "FORWARD", transaction);
          const changed = await documents.updateStatus(
            documentId,
            "DRAFT",
            POSTED_DOCUMENT_STATUS,
            transaction,
          );
          if (!changed) {
            throw new StateConflictError(`单据状态已变更，无法过账：${document.documentNo}`);
          }
          return { ...document, status: POSTED_DOCUMENT_STATUS };
        }

        if (await phaseHandler.isPosted(document, phase, transaction)) {
          return document;
        }
        if (document.status !== POSTED_DOCUMENT_STATUS) {
          assertDocumentStatusTransition(document.status, POSTED_DOCUMENT_STATUS);
        }
        await phaseHandler.validate(document, phase, transaction);
        const movements = await phaseHandler.apply(document, phase, transaction);
        await appendLedger(document, movements, "FORWARD", transaction);
        if (document.status === POSTED_DOCUMENT_STATUS) {
          return document;
        }
        const changed = await documents.updateStatus(
          documentId,
          "DRAFT",
          POSTED_DOCUMENT_STATUS,
          transaction,
        );
        if (!changed) {
          throw new StateConflictError(`单据状态已变更，无法过账：${document.documentNo}`);
        }
        return { ...document, status: POSTED_DOCUMENT_STATUS };
      });
    },

    async void(documentId: string, context?: TransactionContext): Promise<Document> {
      return inTransaction(context, async (transaction) => {
        const document = await load(documentId, transaction);
        assertDocumentStatusTransition(document.status, VOIDED_DOCUMENT_STATUS);
        await assertNotReferencedByPostedReturn(document, transaction);
        await assertVoidKeepsStockNonNegative(document, transaction);
        const handler = handlerOf(document);
        const phaseHandler = handler.phaseHandler;
        let movements: InventoryMovement[];
        if (phaseHandler === undefined) {
          await handler.validate(document, "REVERSE", transaction);
          movements = await handler.applyInventory(document, "REVERSE", transaction);
        } else {
          movements = await phaseHandler.reverse(document, transaction);
        }
        await appendLedger(document, movements, "REVERSE", transaction);
        const changed = await documents.updateStatus(
          documentId,
          POSTED_DOCUMENT_STATUS,
          VOIDED_DOCUMENT_STATUS,
          transaction,
        );
        if (!changed) {
          throw new StateConflictError(`单据状态已变更，无法作废：${document.documentNo}`);
        }
        return { ...document, status: VOIDED_DOCUMENT_STATUS };
      });
    },
  };
}
