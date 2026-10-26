import type { TransactionContext } from "../../shared/transactions/index.js";
import type {
  StockBalance,
  StockLedgerEntry,
  StockMovement,
  StockMovementFilter,
} from "./model.js";
import type { StockBalanceKey, StockLedgerRepository } from "./ports.js";

type StoredEntry = {
  seq: number;
  occurredAt: string;
  entry: StockLedgerEntry;
};

export function createInMemoryStockLedgerRepository(): StockLedgerRepository {
  const balances = new Map<string, StockBalance>();
  const entries: StoredEntry[] = [];

  const keyOf = (warehouseId: string, itemId: string): string => `${warehouseId}::${itemId}`;

  const copyBalance = (balance: StockBalance): StockBalance => ({ ...balance });

  const copyEntry = (entry: StockLedgerEntry): StockLedgerEntry => ({ ...entry });

  const sortEntries = (order: "asc" | "desc"): StoredEntry[] =>
    [...entries].sort((left, right) =>
      order === "desc"
        ? right.seq - left.seq || right.occurredAt.localeCompare(left.occurredAt)
        : left.seq - right.seq || left.occurredAt.localeCompare(right.occurredAt),
    );

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
      warehouseId: string | null,
      itemId: string | null,
      _context?: TransactionContext,
    ): Promise<StockBalance[]> {
      return [...balances.values()]
        .filter(
          (balance) =>
            (warehouseId === null || balance.warehouseId === warehouseId) &&
            (itemId === null || balance.itemId === itemId),
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

    async ensureBalances(keys: StockBalanceKey[], _context?: TransactionContext): Promise<void> {
      for (const key of keys) {
        const identifier = keyOf(key.warehouseId, key.itemId);
        if (balances.has(identifier)) {
          continue;
        }
        balances.set(identifier, {
          warehouseId: key.warehouseId,
          itemId: key.itemId,
          quantity: "0.000",
          unitCost: "0.000000",
        });
      }
    },

    async saveBalance(balance: StockBalance, _context?: TransactionContext): Promise<void> {
      balances.set(keyOf(balance.warehouseId, balance.itemId), copyBalance(balance));
    },

    async appendEntries(
      newEntries: StockLedgerEntry[],
      _context?: TransactionContext,
    ): Promise<void> {
      for (const entry of newEntries) {
        entries.push({
          seq: entries.length + 1,
          occurredAt: new Date().toISOString(),
          entry: copyEntry(entry),
        });
      }
    },

    async listEntriesByDocument(
      documentId: string,
      _context?: TransactionContext,
    ): Promise<StockLedgerEntry[]> {
      return entries
        .filter((stored) => stored.entry.documentId === documentId)
        .map((stored) => copyEntry(stored.entry));
    },

    async listEntriesByDocumentNo(
      documentNo: string,
      _context?: TransactionContext,
    ): Promise<StockLedgerEntry[]> {
      return entries
        .filter((stored) => stored.entry.documentNo === documentNo)
        .map((stored) => copyEntry(stored.entry));
    },

    async listMovements(
      filter: StockMovementFilter,
      _context?: TransactionContext,
    ): Promise<StockMovement[]> {
      const from = filter.occurredFrom === null ? null : Date.parse(filter.occurredFrom);
      const to = filter.occurredTo === null ? null : Date.parse(filter.occurredTo);
      return sortEntries(filter.order)
        .filter((stored) => {
          const entry = stored.entry;
          if (filter.documentNo !== null && entry.documentNo !== filter.documentNo) {
            return false;
          }
          if (filter.warehouseId !== null && entry.warehouseId !== filter.warehouseId) {
            return false;
          }
          if (filter.itemId !== null && entry.itemId !== filter.itemId) {
            return false;
          }
          if (filter.lineNo !== null && entry.lineNo !== filter.lineNo) {
            return false;
          }
          const occurredAt = Date.parse(stored.occurredAt);
          if (from !== null && occurredAt < from) {
            return false;
          }
          if (to !== null && occurredAt > to) {
            return false;
          }
          return true;
        })
        .map((stored) => ({ ...copyEntry(stored.entry), occurredAt: stored.occurredAt }));
    },
  };
}
