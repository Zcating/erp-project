import type { TransactionContext } from "../../shared/transactions";
import type { InTransitQuantity } from "../inventory";
import type { TransferInTransitRecord } from "./model";

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
