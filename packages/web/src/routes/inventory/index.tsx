import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { AdminShell } from "@/components/admin-shell";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import {
  stockBalanceQueryOptions,
  stockItemFilterAtom,
  stockWarehouseFilterAtom,
} from "@/features/inventory";
import { itemListQueryOptions, itemOptions } from "@/features/items";
import { warehouseListQueryOptions, warehouseOptionsWithoutCode } from "@/features/parties";

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
        <div>
          <Label
            id="stock-warehouse-filter-label"
            htmlFor="stock-warehouse-filter"
            className="block text-sm"
          >
            仓库
          </Label>
          <Picker
            id="stock-warehouse-filter"
            className="mt-1 w-48"
            value={warehouseFilter}
            onValueChange={setWarehouseFilter}
            options={[
              { value: "", label: "全部仓库" },
              ...warehouseOptionsWithoutCode(warehouses ?? []),
            ]}
            data-testid="stock-warehouse-filter"
            aria-labelledby="stock-warehouse-filter-label"
          />
        </div>

        <div>
          <Label id="stock-item-filter-label" htmlFor="stock-item-filter" className="block text-sm">
            商品
          </Label>
          <Picker
            id="stock-item-filter"
            className="mt-1 w-48"
            value={itemFilter}
            onValueChange={setItemFilter}
            options={[{ value: "", label: "全部商品" }, ...itemOptions(items ?? [])]}
            data-testid="stock-item-filter"
            aria-labelledby="stock-item-filter-label"
          />
        </div>
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
