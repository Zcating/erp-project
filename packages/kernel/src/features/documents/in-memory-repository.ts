import { QUANTITY_SCALE, quantity, toFixedString } from "@erp-project/shared";
import { DuplicateError } from "../../shared/errors";
import type { MasterDataReference } from "../../shared/ports";
import type { Document, DocumentFilter, DocumentStatus, DocumentType } from "./model";
import type { DocumentRepository } from "./ports";
import { DOCUMENT_TYPE_RULES } from "./rules";

export function createInMemoryDocumentRepository(): DocumentRepository {
  const stored = new Map<string, Document>();
  const counters = new Map<string, number>();

  const copy = (document: Document): Document => ({
    ...document,
    lines: document.lines.map((line) => ({ ...line })),
  });

  const findByDocumentNo = (documentNo: string): Document | null => {
    for (const document of stored.values()) {
      if (document.documentNo === documentNo) {
        return document;
      }
    }
    return null;
  };

  const referencesOf = (masterDataId: string): MasterDataReference[] =>
    [...stored.values()]
      .filter(
        (document) =>
          document.supplierId === masterDataId ||
          document.customerId === masterDataId ||
          document.sourceWarehouseId === masterDataId ||
          document.targetWarehouseId === masterDataId ||
          document.warehouseId === masterDataId,
      )
      .map((document) => ({ documentNo: document.documentNo }));

  return {
    async list(filter: DocumentFilter): Promise<Document[]> {
      return [...stored.values()]
        .filter(
          (document) =>
            (filter.type === null || document.type === filter.type) &&
            (filter.status === null || document.status === filter.status),
        )
        .map(copy);
    },

    async findById(id: string): Promise<Document | null> {
      const document = stored.get(id);
      return document === undefined ? null : copy(document);
    },

    async findByIdForUpdate(id: string): Promise<Document | null> {
      const document = stored.get(id);
      return document === undefined ? null : copy(document);
    },

    async findByDocumentNo(documentNo: string): Promise<Document | null> {
      const document = findByDocumentNo(documentNo);
      return document === null ? null : copy(document);
    },

    async findByLineId(lineId: string): Promise<Document | null> {
      for (const document of stored.values()) {
        if (document.lines.some((line) => line.id === lineId)) {
          return copy(document);
        }
      }
      return null;
    },

    async findByLineIdForUpdate(lineId: string): Promise<Document | null> {
      for (const document of stored.values()) {
        if (document.lines.some((line) => line.id === lineId)) {
          return copy(document);
        }
      }
      return null;
    },

    async findDocumentIdsByLineIds(
      lineIds: readonly string[],
    ): Promise<Array<{ lineId: string; documentId: string }>> {
      const wanted = new Set(lineIds);
      const mappings: Array<{ lineId: string; documentId: string }> = [];
      for (const document of stored.values()) {
        for (const line of document.lines) {
          if (wanted.has(line.id)) {
            mappings.push({ lineId: line.id, documentId: document.id });
          }
        }
      }
      return mappings;
    },

    async sumPostedReturnedQuantity(originalLineId: string): Promise<string> {
      let total = "0.000";
      for (const document of stored.values()) {
        if (document.status !== "POSTED") {
          continue;
        }
        for (const line of document.lines) {
          if (line.originalLineId === originalLineId) {
            total = toFixedString(quantity(total).plus(quantity(line.quantity)), QUANTITY_SCALE);
          }
        }
      }
      return total;
    },

    async listReturnLineReferences(
      originalLineId: string,
    ): Promise<Array<{ documentId: string; lineNo: number }>> {
      const references: Array<{ documentId: string; lineNo: number }> = [];
      for (const document of stored.values()) {
        for (const line of document.lines) {
          if (line.originalLineId === originalLineId) {
            references.push({ documentId: document.id, lineNo: line.lineNo });
          }
        }
      }
      return references;
    },

    async listPostedReturnReferences(
      originalDocumentId: string,
    ): Promise<Array<{ documentId: string; documentNo: string }>> {
      const originalLineIds = new Set(
        (stored.get(originalDocumentId)?.lines ?? []).map((line) => line.id),
      );
      const references: Array<{ documentId: string; documentNo: string }> = [];
      for (const document of stored.values()) {
        if (document.status !== "POSTED") {
          continue;
        }
        if (DOCUMENT_TYPE_RULES[document.type].originalType === null) {
          continue;
        }
        const referencesOriginal = document.lines.some(
          (line) => line.originalLineId !== null && originalLineIds.has(line.originalLineId),
        );
        if (!referencesOriginal) {
          continue;
        }
        references.push({ documentId: document.id, documentNo: document.documentNo });
      }
      return references;
    },

    async insert(document: Document): Promise<void> {
      if (findByDocumentNo(document.documentNo) !== null) {
        throw new DuplicateError(`单据号重复：${document.documentNo}`);
      }
      stored.set(document.id, copy(document));
    },

    async update(document: Document): Promise<void> {
      const existing = stored.get(document.id);
      if (existing === undefined) {
        return;
      }
      stored.set(document.id, { ...copy(document), status: existing.status });
    },

    async updateStatus(id: string, from: DocumentStatus, to: DocumentStatus): Promise<boolean> {
      const document = stored.get(id);
      if (document === undefined || document.status !== from) {
        return false;
      }
      stored.set(id, { ...document, status: to });
      return true;
    },

    async remove(id: string): Promise<boolean> {
      return stored.delete(id);
    },

    async nextSequence(type: DocumentType, dateKey: string): Promise<number> {
      const key = `${type}-${dateKey}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },

    async findMasterDataReferences(masterDataId: string): Promise<MasterDataReference[]> {
      return referencesOf(masterDataId);
    },

    async findPostedItemReferences(itemId: string): Promise<MasterDataReference[]> {
      return [...stored.values()]
        .filter(
          (document) =>
            document.status !== "DRAFT" && document.lines.some((line) => line.itemId === itemId),
        )
        .map((document) => ({ documentNo: document.documentNo }));
    },
  };
}
