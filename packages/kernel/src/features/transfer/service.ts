import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document } from "../documents/index.js";
import { TRANSFER_POSTING_PHASES } from "./model.js";
import type { TransferInTransitRecord } from "./model.js";
import type { TransferInTransitRepository } from "./ports.js";

export type TransferQueryService = {
  listInTransit(
    documentId: string,
    context?: TransactionContext,
  ): Promise<TransferInTransitRecord[]>;
  listPostedPhases(documentId: string, context?: TransactionContext): Promise<string[]>;
  listPostedPhasesOf(
    documents: Document[],
    context?: TransactionContext,
  ): Promise<Map<string, string[]>>;
};

export function createTransferQueryService(
  inTransit: TransferInTransitRepository,
): TransferQueryService {
  const phasesOf = (records: TransferInTransitRecord[]): string[] => {
    const phases: string[] = [];
    if (records.length > 0) {
      phases.push(TRANSFER_POSTING_PHASES.OUT);
    }
    if (records.some((record) => record.status === "RECEIVED")) {
      phases.push(TRANSFER_POSTING_PHASES.IN);
    }
    return phases;
  };

  return {
    async listInTransit(
      documentId: string,
      context?: TransactionContext,
    ): Promise<TransferInTransitRecord[]> {
      return inTransit.listByDocument(documentId, context);
    },

    async listPostedPhases(documentId: string, context?: TransactionContext): Promise<string[]> {
      return phasesOf(await inTransit.listByDocument(documentId, context));
    },

    async listPostedPhasesOf(
      documents: Document[],
      context?: TransactionContext,
    ): Promise<Map<string, string[]>> {
      const result = new Map<string, string[]>();
      const transfers = documents.filter((document) => document.type === "TRANSFER");
      if (transfers.length === 0) {
        return result;
      }
      const records = await inTransit.listByDocuments(
        transfers.map((document) => document.id),
        context,
      );
      for (const document of transfers) {
        result.set(
          document.id,
          phasesOf(records.filter((record) => record.documentId === document.id)),
        );
      }
      return result;
    },
  };
}
