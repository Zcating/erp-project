import { QUANTITY_SCALE, quantity, toFixedString } from "@erp-project/shared";
import type { TransactionContext } from "../../shared/transactions";
import type {
  StockBalance,
  StockBalanceFilter,
  StockBalanceSummary,
  StockMovement,
  StockMovementFilter,
} from "./model";
import type { InTransitQuantityReader, StockLedgerRepository } from "./ports";

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

export type InventoryQueryServiceOptions = {
  inTransit?: InTransitQuantityReader;
};

export function createInventoryQueryService(
  ledger: StockLedgerRepository,
  options: InventoryQueryServiceOptions = {},
): InventoryQueryService {
  const reader = options.inTransit;
  return {
    async listBalances(
      filter: StockBalanceFilter,
      context?: TransactionContext,
    ): Promise<StockBalanceSummary[]> {
      const balances = await ledger.listBalances(filter.warehouseId, filter.itemId, context);
      const inTransit = await sumInTransit(reader, filter, context);
      return balances.map((balance) => toSummary(balance, inTransit));
    },

    async listMovements(
      filter: StockMovementFilter,
      context?: TransactionContext,
    ): Promise<StockMovement[]> {
      return ledger.listMovements(filter, context);
    },
  };
}

async function sumInTransit(
  reader: InTransitQuantityReader | undefined,
  filter: StockBalanceFilter,
  context: TransactionContext | undefined,
): Promise<Map<string, string>> {
  const sums = new Map<string, string>();
  if (reader === undefined) {
    return sums;
  }
  const rows = await reader.listInTransit(filter.warehouseId, filter.itemId, context);
  for (const row of rows) {
    const key = `${row.warehouseId}::${row.itemId}`;
    const current = quantity(sums.get(key) ?? IN_TRANSIT_PLACEHOLDER);
    sums.set(key, toFixedString(current.plus(quantity(row.quantity)), QUANTITY_SCALE));
  }
  return sums;
}

function toSummary(balance: StockBalance, inTransit: Map<string, string>): StockBalanceSummary {
  return {
    warehouseId: balance.warehouseId,
    itemId: balance.itemId,
    onHand: balance.quantity,
    available: balance.quantity,
    inTransit: inTransit.get(`${balance.warehouseId}::${balance.itemId}`) ?? IN_TRANSIT_PLACEHOLDER,
    unitCost: balance.unitCost,
  };
}
