import { NotFoundError, StateConflictError } from "../../shared/errors/index.js";
import type { TransactionContext, TransactionRunner } from "../../shared/transactions/index.js";
import type { Document } from "../documents/model.js";
import type { DocumentRepository } from "../documents/ports.js";
import { assertDocumentStatusTransition } from "../documents/state-machine.js";
import type { StockLedgerRepository } from "../inventory/ports.js";
import type { PostingTypeHandler } from "./model.js";

export type PostingService = {
  post(documentId: string, context?: TransactionContext): Promise<Document>;
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

  const apply = async (
    document: Document,
    direction: "FORWARD" | "REVERSE",
    context: TransactionContext | undefined,
  ): Promise<void> => {
    const handler = handlerOf(document);
    await handler.validate(document, direction, context);
    const movements = await handler.applyInventory(document, direction, context);
    const entries = await handler.buildLedger(document, movements, direction);
    if (entries.length > 0) {
      await ledger.appendEntries(entries, context);
    }
  };

  return {
    async post(documentId: string, context?: TransactionContext): Promise<Document> {
      return inTransaction(context, async (transaction) => {
        const document = await load(documentId, transaction);
        if (document.status === "POSTED") {
          return document;
        }
        assertDocumentStatusTransition(document.status, "POSTED");
        await apply(document, "FORWARD", transaction);
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
        await apply(document, "REVERSE", transaction);
        const changed = await documents.updateStatus(documentId, "POSTED", "VOIDED", transaction);
        if (!changed) {
          throw new StateConflictError(`单据状态已变更，无法作废：${document.documentNo}`);
        }
        return { ...document, status: "VOIDED" };
      });
    },
  };
}
