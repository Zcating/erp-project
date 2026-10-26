import type {
  MasterDataReferenceChecker,
  PostedItemReferenceChecker,
} from "../../shared/ports/index.js";
import type { ItemMaster } from "../item-master/model.js";
import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document, DocumentFilter, DocumentStatus, DocumentType } from "./model.js";

export type DocumentRepository = MasterDataReferenceChecker &
  PostedItemReferenceChecker & {
    list(filter: DocumentFilter, context?: TransactionContext): Promise<Document[]>;
    findById(id: string, context?: TransactionContext): Promise<Document | null>;
    findByIdForUpdate(id: string, context?: TransactionContext): Promise<Document | null>;
    findByDocumentNo(documentNo: string, context?: TransactionContext): Promise<Document | null>;
    insert(document: Document, context?: TransactionContext): Promise<void>;
    update(document: Document, context?: TransactionContext): Promise<void>;
    updateStatus(
      id: string,
      from: DocumentStatus,
      to: DocumentStatus,
      context?: TransactionContext,
    ): Promise<boolean>;
    remove(id: string, context?: TransactionContext): Promise<boolean>;
    nextSequence(
      type: DocumentType,
      dateKey: string,
      context?: TransactionContext,
    ): Promise<number>;
  };

export type DocumentItemLookup = {
  findById(id: string, context?: TransactionContext): Promise<ItemMaster | null>;
};
