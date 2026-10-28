import { queryOptions } from "@tanstack/react-query";
import { listStockBalances, listStockMovements } from "@/server";
import type { StockMovementQuery } from "@/server";

export function stockBalanceQueryKey(warehouseId: string, itemId: string) {
  return ["inventory", "balances", warehouseId, itemId] as const;
}

export function stockBalanceQueryOptions(warehouseId: string, itemId: string) {
  return queryOptions({
    queryKey: stockBalanceQueryKey(warehouseId, itemId),
    queryFn: () => listStockBalances({ data: { warehouseId, itemId } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function stockMovementQueryKey(filter: StockMovementQuery) {
  return [
    "inventory",
    "movements",
    filter.documentNo,
    filter.warehouseId,
    filter.itemId,
    filter.lineNo,
    filter.from,
    filter.to,
    filter.order,
  ] as const;
}

export function stockMovementQueryOptions(filter: StockMovementQuery) {
  return queryOptions({
    queryKey: stockMovementQueryKey(filter),
    queryFn: () => listStockMovements({ data: filter }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
