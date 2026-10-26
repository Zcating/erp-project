import type { TransactionContext } from "../../shared/transactions/index.js";
import type { StockBalance, StockLedgerEntry } from "./model.js";
import type { StockLedgerRepository } from "./ports.js";

export type InventoryQueryService = {
  listBalances(
    warehouseId: string,
    itemId: string | null,
    context?: TransactionContext,
  ): Promise<StockBalance[]>;
  listMovements(documentNo: string, context?: TransactionContext): Promise<StockLedgerEntry[]>;
};

export function createInventoryQueryService(ledger: StockLedgerRepository): InventoryQueryService {
  return {
    async listBalances(
      warehouseId: string,
      itemId: string | null,
      context?: TransactionContext,
    ): Promise<StockBalance[]> {
      return ledger.listBalances(warehouseId, itemId, context);
    },

    async listMovements(
      documentNo: string,
      context?: TransactionContext,
    ): Promise<StockLedgerEntry[]> {
      return ledger.listEntriesByDocumentNo(documentNo, context);
    },
  };
}
