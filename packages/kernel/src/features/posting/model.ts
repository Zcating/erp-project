import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document, DraftDocumentType } from "../documents/model.js";
import type { StockLedgerEntry } from "../inventory/model.js";

export const POSTING_DIRECTIONS = ["FORWARD", "REVERSE"] as const;

export type PostingDirection = (typeof POSTING_DIRECTIONS)[number];

export type InventoryMovement = {
  lineNo: number;
  warehouseId: string;
  itemId: string;
  quantityDelta: string;
  quantityBefore: string;
  quantityAfter: string;
  costBefore: string;
  costAfter: string;
  unitPrice: string;
  amount: string;
};

export type PostingTypeHandler = {
  type: DraftDocumentType;
  validate(
    document: Document,
    direction: PostingDirection,
    transaction?: TransactionContext,
  ): Promise<void>;
  applyInventory(
    document: Document,
    direction: PostingDirection,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]>;
  buildLedger(
    document: Document,
    movements: InventoryMovement[],
    direction: PostingDirection,
  ): Promise<StockLedgerEntry[]>;
};
