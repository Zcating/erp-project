import type { TransactionContext } from "../../shared/transactions/index.js";
import type { StockBalance, StockLedgerEntry } from "./model.js";
import type { StockBalanceKey, StockLedgerRepository } from "./ports.js";

export function createInMemoryStockLedgerRepository(): StockLedgerRepository {
  const balances = new Map<string, StockBalance>();
  const entries: StockLedgerEntry[] = [];

  const keyOf = (warehouseId: string, itemId: string): string => `${warehouseId}::${itemId}`;

  const copyBalance = (balance: StockBalance): StockBalance => ({ ...balance });

  const copyEntry = (entry: StockLedgerEntry): StockLedgerEntry => ({ ...entry });

  return {
    async findBalance(
      warehouseId: string,
      itemId: string,
      _context?: TransactionContext,
    ): Promise<StockBalance | null> {
      const balance = balances.get(keyOf(warehouseId, itemId));
      return balance === undefined ? null : copyBalance(balance);
    },

    async listBalances(
      warehouseId: string,
      itemId: string | null,
      _context?: TransactionContext,
    ): Promise<StockBalance[]> {
      return [...balances.values()]
        .filter(
          (balance) =>
            balance.warehouseId === warehouseId && (itemId === null || balance.itemId === itemId),
        )
        .map(copyBalance);
    },

    async findBalancesForUpdate(
      keys: StockBalanceKey[],
      _context?: TransactionContext,
    ): Promise<StockBalance[]> {
      return keys
        .map((key) => balances.get(keyOf(key.warehouseId, key.itemId)))
        .filter((balance): balance is StockBalance => balance !== undefined)
        .map(copyBalance);
    },

    async saveBalance(balance: StockBalance, _context?: TransactionContext): Promise<void> {
      balances.set(keyOf(balance.warehouseId, balance.itemId), copyBalance(balance));
    },

    async appendEntries(
      newEntries: StockLedgerEntry[],
      _context?: TransactionContext,
    ): Promise<void> {
      for (const entry of newEntries) {
        entries.push(copyEntry(entry));
      }
    },

    async listEntriesByDocument(
      documentId: string,
      _context?: TransactionContext,
    ): Promise<StockLedgerEntry[]> {
      return entries.filter((entry) => entry.documentId === documentId).map(copyEntry);
    },

    async listEntriesByDocumentNo(
      documentNo: string,
      _context?: TransactionContext,
    ): Promise<StockLedgerEntry[]> {
      return entries.filter((entry) => entry.documentNo === documentNo).map(copyEntry);
    },
  };
}
