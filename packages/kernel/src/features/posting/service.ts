import { QUANTITY_SCALE, quantity, toFixedString } from "@erp-inventory-sales/shared";
import {
  NotFoundError,
  StateConflictError,
  StockNegativeError,
  ValidationError,
} from "../../shared/errors/index.js";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions/index.js";
import type { Document } from "../documents/model.js";
import type { DocumentRepository } from "../documents/ports.js";
import { assertDocumentStatusTransition } from "../documents/state-machine.js";
import type { StockLedgerEntry } from "../inventory/model.js";
import type { StockLedgerRepository } from "../inventory/ports.js";
import type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingTypeHandler,
} from "./model.js";
import { DEFAULT_POSTING_PHASE } from "./model.js";

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

  return {
    async post(
      documentId: string,
      context?: TransactionContext,
      phase: PostingPhase = DEFAULT_POSTING_PHASE,
    ): Promise<Document> {
      return inTransaction(context, async (transaction) => {
        const document = await load(documentId, transaction);
        const handler = handlerOf(document);
        const phaseHandler = handler.phaseHandler;

        if (phaseHandler === undefined) {
          if (document.status === "POSTED") {
            return document;
          }
          assertDocumentStatusTransition(document.status, "POSTED");
          await handler.validate(document, "FORWARD", transaction);
          const movements = await handler.applyInventory(document, "FORWARD", transaction);
          await appendLedger(document, movements, "FORWARD", transaction);
          const changed = await documents.updateStatus(documentId, "DRAFT", "POSTED", transaction);
          if (!changed) {
            throw new StateConflictError(`单据状态已变更，无法过账：${document.documentNo}`);
          }
          return { ...document, status: "POSTED" };
        }

        if (!phaseHandler.phases.includes(phase)) {
          throw new ValidationError(`单据 ${document.documentNo} 不支持的过账阶段：${phase}`);
        }
        if (await phaseHandler.isPosted(document, phase, transaction)) {
          return document;
        }
        if (document.status !== "POSTED") {
          assertDocumentStatusTransition(document.status, "POSTED");
        }
        await phaseHandler.validate(document, phase, transaction);
        const movements = await phaseHandler.apply(document, phase, transaction);
        await appendLedger(document, movements, "FORWARD", transaction);
        if (document.status === "POSTED") {
          return document;
        }
        const changed = await documents.updateStatus(documentId, "DRAFT", "POSTED", transaction);
        if (!changed) {
          throw new StateConflictError(`单据状态已变更，无法过账：${document.documentNo}`);
        }
        return { ...document, status: "POSTED" };
      });
    },

    async void(documentId: string, context?: TransactionContext): Promise<Document> {
      return inTransaction(context, async (transaction) => {
        const document = await load(documentId, transaction);
        assertDocumentStatusTransition(document.status, "VOIDED");
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
        const changed = await documents.updateStatus(documentId, "POSTED", "VOIDED", transaction);
        if (!changed) {
          throw new StateConflictError(`单据状态已变更，无法作废：${document.documentNo}`);
        }
        return { ...document, status: "VOIDED" };
      });
    },
  };
}
