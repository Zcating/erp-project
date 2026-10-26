import type { InTransitQuantity } from "../inventory/ports.js";
import type { TransferInTransitRecord } from "./model.js";
import type { TransferInTransitRepository } from "./ports.js";

export function createInMemoryTransferInTransitRepository(): TransferInTransitRepository {
  const stored = new Map<string, TransferInTransitRecord>();

  const copy = (record: TransferInTransitRecord): TransferInTransitRecord => ({ ...record });

  const of = (
    documentIds: string[],
    predicate: (record: TransferInTransitRecord) => boolean,
  ): TransferInTransitRecord[] =>
    [...stored.values()]
      .filter((record) => documentIds.includes(record.documentId) && predicate(record))
      .sort(
        (left, right) =>
          left.documentNo.localeCompare(right.documentNo) || left.lineNo - right.lineNo,
      )
      .map(copy);

  return {
    async create(record: TransferInTransitRecord): Promise<void> {
      stored.set(record.id, copy(record));
    },

    async update(record: TransferInTransitRecord): Promise<void> {
      stored.set(record.id, copy(record));
    },

    async removeByDocument(documentId: string): Promise<void> {
      for (const [id, record] of stored.entries()) {
        if (record.documentId === documentId) {
          stored.delete(id);
        }
      }
    },

    async listByDocument(documentId: string): Promise<TransferInTransitRecord[]> {
      return of([documentId], () => true);
    },

    async listByDocuments(documentIds: string[]): Promise<TransferInTransitRecord[]> {
      return of(documentIds, () => true);
    },

    async listInTransit(
      warehouseId: string | null,
      itemId: string | null,
    ): Promise<InTransitQuantity[]> {
      return [...stored.values()]
        .filter(
          (record) =>
            record.status === "IN_TRANSIT" &&
            (warehouseId === null || record.sourceWarehouseId === warehouseId) &&
            (itemId === null || record.itemId === itemId),
        )
        .map((record) => ({
          warehouseId: record.sourceWarehouseId,
          itemId: record.itemId,
          quantity: record.quantity,
        }));
    },
  };
}
