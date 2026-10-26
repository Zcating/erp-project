import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { AdminShell } from "@/components/admin-shell";
import {
  stockBalanceQueryOptions,
  stockItemFilterAtom,
  stockWarehouseFilterAtom,
} from "@/features/inventory";
import { itemListQueryOptions } from "@/features/items";
import { warehouseListQueryOptions } from "@/features/parties";

export const Route = createFileRoute("/inventory/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(warehouseListQueryOptions());
    await context.queryClient.ensureQueryData(itemListQueryOptions());
  },
  component: StockQueryPage,
});

function StockQueryPage() {
  const [warehouseFilter, setWarehouseFilter] = useAtom(stockWarehouseFilterAtom);
  const [itemFilter, setItemFilter] = useAtom(stockItemFilterAtom);
  const { data: warehouses } = useQuery(warehouseListQueryOptions());
  const { data: items } = useQuery(itemListQueryOptions());
  const { data: balances, isPending } = useQuery(
    stockBalanceQueryOptions(warehouseFilter, itemFilter),
  );

  const warehouseName = (warehouseId: string): string =>
    (warehouses ?? []).find((warehouse) => warehouse.id === warehouseId)?.name ?? warehouseId;
  const itemName = (itemId: string): string =>
    (items ?? []).find((item) => item.id === itemId)?.code ?? itemId;

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold">库存查询</h1>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="block text-sm" htmlFor="stock-warehouse-filter">
          仓库
          <select
            id="stock-warehouse-filter"
            data-testid="stock-warehouse-filter"
            className="mt-1 block w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={warehouseFilter}
            onChange={(event) => setWarehouseFilter(event.target.value)}
          >
            <option value="">全部仓库</option>
            {(warehouses ?? []).map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm" htmlFor="stock-item-filter">
          商品
          <select
            id="stock-item-filter"
            data-testid="stock-item-filter"
            className="mt-1 block w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={itemFilter}
            onChange={(event) => setItemFilter(event.target.value)}
          >
            <option value="">全部商品</option>
            {(items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table className="w-full border-collapse text-sm" data-testid="stock-table">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4">仓库</th>
            <th className="py-2 pr-4">商品</th>
            <th className="py-2 pr-4">账面库存</th>
            <th className="py-2 pr-4">可用库存</th>
            <th className="py-2 pr-4">在途库存</th>
            <th className="py-2">加权平均成本</th>
          </tr>
        </thead>
        <tbody>
          {(balances ?? []).map((balance) => (
            <tr
              key={`${balance.warehouseId}::${balance.itemId}`}
              data-testid="stock-row"
              className="border-b border-border/60"
            >
              <td className="py-2 pr-4" data-testid="stock-warehouse">
                {warehouseName(balance.warehouseId)}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="stock-item">
                {itemName(balance.itemId)}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="stock-on-hand">
                {balance.onHand}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="stock-available">
                {balance.available}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="stock-in-transit">
                {balance.inTransit}
              </td>
              <td className="py-2 font-mono" data-testid="stock-unit-cost">
                {balance.unitCost}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isPending ? <p className="mt-4 text-sm text-muted-foreground">加载中…</p> : null}

      {(balances ?? []).length === 0 && !isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="stock-empty">
          没有匹配的库存记录
        </p>
      ) : null}
    </AdminShell>
  );
}
