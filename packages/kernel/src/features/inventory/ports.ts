import type { TransactionContext } from "../../shared/transactions/index.js";
import type {
  StockBalance,
  StockLedgerEntry,
  StockMovement,
  StockMovementFilter,
} from "./model.js";

export type StockBalanceKey = {
  warehouseId: string;
  itemId: string;
};

export type StockLedgerRepository = {
  findBalance(
    warehouseId: string,
    itemId: string,
    context?: TransactionContext,
  ): Promise<StockBalance | null>;
  listBalances(
    warehouseId: string | null,
    itemId: string | null,
    context?: TransactionContext,
  ): Promise<StockBalance[]>;
  findBalancesForUpdate(
    keys: StockBalanceKey[],
    context?: TransactionContext,
  ): Promise<StockBalance[]>;
  ensureBalances(keys: StockBalanceKey[], context?: TransactionContext): Promise<void>;
  saveBalance(balance: StockBalance, context?: TransactionContext): Promise<void>;
  appendEntries(entries: StockLedgerEntry[], context?: TransactionContext): Promise<void>;
  listEntriesByDocument(
    documentId: string,
    context?: TransactionContext,
  ): Promise<StockLedgerEntry[]>;
  listEntriesByDocumentNo(
    documentNo: string,
    context?: TransactionContext,
  ): Promise<StockLedgerEntry[]>;
  listMovements(
    filter: StockMovementFilter,
    context?: TransactionContext,
  ): Promise<StockMovement[]>;
};
