import type { TransactionContext } from "../../shared/transactions/index.js";
import type { Document, DraftDocumentType } from "../documents/model.js";
import type { StockLedgerEntry } from "../inventory/model.js";

export const POSTING_DIRECTIONS = ["FORWARD", "REVERSE"] as const;

export type PostingDirection = (typeof POSTING_DIRECTIONS)[number];

export const DEFAULT_POSTING_PHASE = "DEFAULT";

export type PostingPhase = string;

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

export type PostingPhaseHandler = {
  phases: readonly PostingPhase[];
  isPosted(document: Document, phase: PostingPhase, context?: TransactionContext): Promise<boolean>;
  validate(document: Document, phase: PostingPhase, context?: TransactionContext): Promise<void>;
  apply(
    document: Document,
    phase: PostingPhase,
    context?: TransactionContext,
  ): Promise<InventoryMovement[]>;
  reverse(document: Document, context?: TransactionContext): Promise<InventoryMovement[]>;
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
  phaseHandler?: PostingPhaseHandler;
};
