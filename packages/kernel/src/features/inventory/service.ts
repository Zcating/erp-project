import type { TransactionContext } from "../../shared/transactions/index.js";
import type {
  StockBalance,
  StockBalanceFilter,
  StockBalanceSummary,
  StockMovement,
  StockMovementFilter,
} from "./model.js";
import type { StockLedgerRepository } from "./ports.js";

const IN_TRANSIT_PLACEHOLDER = "0.000";

export type InventoryQueryService = {
  listBalances(
    filter: StockBalanceFilter,
    context?: TransactionContext,
  ): Promise<StockBalanceSummary[]>;
  listMovements(
    filter: StockMovementFilter,
    context?: TransactionContext,
  ): Promise<StockMovement[]>;
};

export function createInventoryQueryService(ledger: StockLedgerRepository): InventoryQueryService {
  return {
    async listBalances(
      filter: StockBalanceFilter,
      context?: TransactionContext,
    ): Promise<StockBalanceSummary[]> {
      const balances = await ledger.listBalances(filter.warehouseId, filter.itemId, context);
      return balances.map(toSummary);
    },

    async listMovements(
      filter: StockMovementFilter,
      context?: TransactionContext,
    ): Promise<StockMovement[]> {
      return ledger.listMovements(filter, context);
    },
  };
}

function toSummary(balance: StockBalance): StockBalanceSummary {
  return {
    warehouseId: balance.warehouseId,
    itemId: balance.itemId,
    onHand: balance.quantity,
    available: balance.quantity,
    inTransit: IN_TRANSIT_PLACEHOLDER,
    unitCost: balance.unitCost,
  };
}
