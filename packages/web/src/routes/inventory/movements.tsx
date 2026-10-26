import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { AdminShell } from "@/components/admin-shell";
import {
  movementDocumentNoFilterAtom,
  movementFromFilterAtom,
  movementItemFilterAtom,
  movementLineNoFilterAtom,
  movementOrderAtom,
  movementToFilterAtom,
  movementWarehouseFilterAtom,
  stockMovementQueryOptions,
} from "@/features/inventory";
import { itemListQueryOptions } from "@/features/items";
import { warehouseListQueryOptions } from "@/features/parties";

export const Route = createFileRoute("/inventory/movements")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(warehouseListQueryOptions());
    await context.queryClient.ensureQueryData(itemListQueryOptions());
  },
  component: StockMovementPage,
});

function StockMovementPage() {
  const [documentNoFilter, setDocumentNoFilter] = useAtom(movementDocumentNoFilterAtom);
  const [warehouseFilter, setWarehouseFilter] = useAtom(movementWarehouseFilterAtom);
  const [itemFilter, setItemFilter] = useAtom(movementItemFilterAtom);
  const [lineNoFilter, setLineNoFilter] = useAtom(movementLineNoFilterAtom);
  const [fromFilter, setFromFilter] = useAtom(movementFromFilterAtom);
  const [toFilter, setToFilter] = useAtom(movementToFilterAtom);
  const [order, setOrder] = useAtom(movementOrderAtom);
  const { data: warehouses } = useQuery(warehouseListQueryOptions());
  const { data: items } = useQuery(itemListQueryOptions());
  const { data: movements, isPending } = useQuery(
    stockMovementQueryOptions({
      documentNo: documentNoFilter,
      warehouseId: warehouseFilter,
      itemId: itemFilter,
      lineNo: lineNoFilter,
      from: fromFilter,
      to: toFilter,
      order,
    }),
  );

  const warehouseName = (warehouseId: string): string =>
    (warehouses ?? []).find((warehouse) => warehouse.id === warehouseId)?.name ?? warehouseId;
  const itemName = (itemId: string): string =>
    (items ?? []).find((item) => item.id === itemId)?.code ?? itemId;

  return (
    <AdminShell>
      <h1 className="mb-4 text-2xl font-semibold">库存流水</h1>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="block text-sm" htmlFor="movement-document-no-filter">
          单据号
          <input
            id="movement-document-no-filter"
            data-testid="movement-document-no-filter"
            className="mt-1 block w-56 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={documentNoFilter}
            onChange={(event) => setDocumentNoFilter(event.target.value)}
            placeholder="按单据号筛选"
          />
        </label>

        <label className="block text-sm" htmlFor="movement-warehouse-filter">
          仓库
          <select
            id="movement-warehouse-filter"
            data-testid="movement-warehouse-filter"
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

        <label className="block text-sm" htmlFor="movement-item-filter">
          商品
          <select
            id="movement-item-filter"
            data-testid="movement-item-filter"
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

        <label className="block text-sm" htmlFor="movement-line-no-filter">
          行号
          <input
            id="movement-line-no-filter"
            data-testid="movement-line-no-filter"
            className="mt-1 block w-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={lineNoFilter}
            onChange={(event) => setLineNoFilter(event.target.value)}
            placeholder="行号"
          />
        </label>

        <label className="block text-sm" htmlFor="movement-from-filter">
          起始时间
          <input
            id="movement-from-filter"
            data-testid="movement-from-filter"
            type="datetime-local"
            className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={fromFilter}
            onChange={(event) => setFromFilter(event.target.value)}
          />
        </label>

        <label className="block text-sm" htmlFor="movement-to-filter">
          截止时间
          <input
            id="movement-to-filter"
            data-testid="movement-to-filter"
            type="datetime-local"
            className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={toFilter}
            onChange={(event) => setToFilter(event.target.value)}
          />
        </label>

        <label className="block text-sm" htmlFor="movement-order-filter">
          排序方向
          <select
            id="movement-order-filter"
            data-testid="movement-order-filter"
            className="mt-1 block w-32 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={order}
            onChange={(event) => setOrder(event.target.value === "desc" ? "desc" : "asc")}
          >
            <option value="asc">时间正序</option>
            <option value="desc">时间倒序</option>
          </select>
        </label>
      </div>

      <table className="w-full border-collapse text-sm" data-testid="movement-table">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4">单据号</th>
            <th className="py-2 pr-4">行号</th>
            <th className="py-2 pr-4">仓库</th>
            <th className="py-2 pr-4">商品</th>
            <th className="py-2 pr-4">变动前数量</th>
            <th className="py-2 pr-4">变动后数量</th>
            <th className="py-2 pr-4">单价</th>
            <th className="py-2 pr-4">结转金额</th>
            <th className="py-2">发生时间</th>
          </tr>
        </thead>
        <tbody>
          {(movements ?? []).map((movement) => (
            <tr
              key={`${movement.documentId}::${movement.warehouseId}::${movement.lineNo}::${movement.direction}`}
              data-testid="movement-row"
              className="border-b border-border/60"
            >
              <td className="py-2 pr-4 font-mono" data-testid="movement-document-no">
                {movement.documentNo}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="movement-line-no">
                {movement.lineNo}
              </td>
              <td className="py-2 pr-4" data-testid="movement-warehouse">
                {warehouseName(movement.warehouseId)}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="movement-item">
                {itemName(movement.itemId)}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="movement-quantity-before">
                {movement.quantityBefore}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="movement-quantity-after">
                {movement.quantityAfter}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="movement-unit-price">
                {movement.unitPrice}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="movement-amount">
                {movement.amount}
              </td>
              <td className="py-2 font-mono" data-testid="movement-occurred-at">
                {movement.occurredAt}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isPending ? <p className="mt-4 text-sm text-muted-foreground">加载中…</p> : null}

      {(movements ?? []).length === 0 && !isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="movement-empty">
          没有匹配的库存流水
        </p>
      ) : null}
    </AdminShell>
  );
}
