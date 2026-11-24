import type { TransactionContext } from "../../shared/transactions";
import type { Document } from "./model";
import type { DocumentRepository } from "./ports";

export async function lockOriginalDocuments(
  documents: DocumentRepository,
  originalLineIds: readonly string[],
  context?: TransactionContext,
): Promise<Map<string, Document>> {
  const uniqueLineIds: string[] = [];
  const seen = new Set<string>();
  for (const lineId of originalLineIds) {
    if (seen.has(lineId)) {
      continue;
    }
    seen.add(lineId);
    uniqueLineIds.push(lineId);
  }

  const mappings = await documents.findDocumentIdsByLineIds(uniqueLineIds, context);
  const linesByDocument = new Map<string, string[]>();
  for (const mapping of mappings) {
    const lines = linesByDocument.get(mapping.documentId) ?? [];
    lines.push(mapping.lineId);
    linesByDocument.set(mapping.documentId, lines);
  }

  const documentIds = [...linesByDocument.keys()].sort();
  const locked = new Map<string, Document>();
  for (const documentId of documentIds) {
    const lineIds = linesByDocument.get(documentId) as string[];
    const document = await documents.findByLineIdForUpdate(lineIds[0] as string, context);
    if (document === null) {
      continue;
    }
    for (const lineId of lineIds) {
      locked.set(lineId, document);
    }
  }
  return locked;
}
