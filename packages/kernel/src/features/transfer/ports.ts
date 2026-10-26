import type { TransactionContext } from "../../shared/transactions/index.js";
import type { InTransitQuantity } from "../inventory/index.js";
import type { TransferInTransitRecord } from "./model.js";

export type TransferInTransitRepository = {
  create(record: TransferInTransitRecord, context?: TransactionContext): Promise<void>;
  update(record: TransferInTransitRecord, context?: TransactionContext): Promise<void>;
  removeByDocument(documentId: string, context?: TransactionContext): Promise<void>;
  listByDocument(
    documentId: string,
    context?: TransactionContext,
  ): Promise<TransferInTransitRecord[]>;
  listByDocuments(
    documentIds: string[],
    context?: TransactionContext,
  ): Promise<TransferInTransitRecord[]>;
  listInTransit(
    warehouseId: string | null,
    itemId: string | null,
    context?: TransactionContext,
  ): Promise<InTransitQuantity[]>;
};
