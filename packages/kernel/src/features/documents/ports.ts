import type { MasterDataReferenceChecker } from "../../shared/ports/index.js";
import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document, DocumentFilter, DocumentType } from "./model.js";

export type DocumentRepository = MasterDataReferenceChecker & {
  list(filter: DocumentFilter, context?: TransactionContext): Promise<Document[]>;
  findById(id: string, context?: TransactionContext): Promise<Document | null>;
  findByDocumentNo(documentNo: string, context?: TransactionContext): Promise<Document | null>;
  insert(document: Document, context?: TransactionContext): Promise<void>;
  update(document: Document, context?: TransactionContext): Promise<void>;
  remove(id: string, context?: TransactionContext): Promise<boolean>;
  nextSequence(type: DocumentType, dateKey: string, context?: TransactionContext): Promise<number>;
};
