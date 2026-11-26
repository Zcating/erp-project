import type { TransactionContext } from "../../shared/transactions";
import type { DocumentType } from "../../shared/document-types";
import type { Document, DocumentRepository } from "../documents";
import type { StockBalance, StockBalanceKey, StockLedgerRepository } from "../inventory";

export const POSTING_DIRECTIONS = ["FORWARD", "REVERSE"] as const;

export type PostingDirection = (typeof POSTING_DIRECTIONS)[number];

export const POSTING_PHASES = {
  DEFAULT: "DEFAULT",
  OUT: "OUT",
  IN: "IN",
} as const;

export type PostingPhase = (typeof POSTING_PHASES)[keyof typeof POSTING_PHASES];

export const DEFAULT_POSTING_PHASE = POSTING_PHASES.DEFAULT;

export function isPostingPhase(value: string): value is PostingPhase {
  return (Object.values(POSTING_PHASES) as string[]).includes(value);
}

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

export type PostingSaveMode = "per-line" | "after-loop";

export type PostingHandlerPolicy = {
  saveMode: PostingSaveMode;
  ensureZeroBalances: boolean;
};

export type PostingContext = {
  readonly ledger: StockLedgerRepository;
  readonly documents: DocumentRepository;
  readonly transaction: TransactionContext | undefined;
};

export type PostingApplyContext = PostingContext & {
  lockBalances(keys: readonly StockBalanceKey[]): Promise<void>;
  balanceOf(key: StockBalanceKey): StockBalance;
  saveBalance(balance: StockBalance): Promise<void>;
};

export type PostingPhaseHandler = {
  phases: readonly PostingPhase[];
  policy: PostingHandlerPolicy;
  isPosted(document: Document, phase: PostingPhase, context?: TransactionContext): Promise<boolean>;
  validate(document: Document, phase: PostingPhase, context?: TransactionContext): Promise<void>;
  apply(
    document: Document,
    phase: PostingPhase,
    context: PostingApplyContext,
  ): Promise<InventoryMovement[]>;
  reverse(document: Document, context: PostingContext): Promise<InventoryMovement[]>;
};

export type PostingApplyHandler = {
  type: DocumentType;
  policy: PostingHandlerPolicy;
  apply(document: Document, context: PostingApplyContext): Promise<InventoryMovement[]>;
  phaseHandler?: never;
};

export type PostingPhaseTypeHandler = {
  type: DocumentType;
  phaseHandler: PostingPhaseHandler;
  apply?: never;
  policy?: never;
};

export type PostingTypeHandler = PostingApplyHandler | PostingPhaseTypeHandler;
