import type { TransactionContext, TransactionRunner } from "../../shared/transactions";
import type { Document, DocumentRepository } from "../documents";
import type { StockLedgerRepository } from "../inventory";
import type { PostingPhase, PostingTypeHandler } from "./model";
import { createPostingOrchestration } from "./orchestration";

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
  const orchestration = createPostingOrchestration({ documents, ledger, handlers });

  const inTransaction = async <T>(
    context: TransactionContext | undefined,
    work: (context: TransactionContext | undefined) => Promise<T>,
  ): Promise<T> => {
    if (context !== undefined || runner === undefined) {
      return work(context);
    }
    return runner.run((outer) => work(outer));
  };

  return {
    async post(documentId, context, phase) {
      return inTransaction(context, (transaction) =>
        orchestration.post(documentId, transaction, phase),
      );
    },

    async void(documentId, context) {
      return inTransaction(context, (transaction) => orchestration.void(documentId, transaction));
    },
  };
}
