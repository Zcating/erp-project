import type { MasterDataReferenceChecker, PostedItemReferenceChecker } from "../../shared/ports";
import type { ItemMaster } from "../item-master";
import type { TransactionContext } from "../../shared/transactions";
import type { Document, DocumentFilter, DocumentStatus, DocumentType } from "./model";

export type DocumentRepository = MasterDataReferenceChecker &
  PostedItemReferenceChecker & {
    list(filter: DocumentFilter, context?: TransactionContext): Promise<Document[]>;
    findById(id: string, context?: TransactionContext): Promise<Document | null>;
    findByIdForUpdate(id: string, context?: TransactionContext): Promise<Document | null>;
    findByDocumentNo(documentNo: string, context?: TransactionContext): Promise<Document | null>;
    findByLineId(lineId: string, context?: TransactionContext): Promise<Document | null>;
    findByLineIdForUpdate(lineId: string, context?: TransactionContext): Promise<Document | null>;
    sumPostedReturnedQuantity(
      originalLineId: string,
      context?: TransactionContext,
    ): Promise<string>;
    listReturnLineReferences(
      originalLineId: string,
      context?: TransactionContext,
    ): Promise<Array<{ documentId: string; lineNo: number }>>;
    listPostedReturnReferences(
      originalDocumentId: string,
      context?: TransactionContext,
    ): Promise<Array<{ documentId: string; documentNo: string }>>;
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
