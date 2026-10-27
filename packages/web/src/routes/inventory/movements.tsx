import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { AdminShell } from "@/components/admin-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import {
  movementDocumentNoFilterAtom,
  movementFromFilterAtom,
  movementItemFilterAtom,
  movementLineNoFilterAtom,
  movementOrderAtom,
  movementOrderOptions,
  movementToFilterAtom,
  movementWarehouseFilterAtom,
  stockMovementQueryOptions,
} from "@/features/inventory";
import { itemListQueryOptions, itemOptions } from "@/features/items";
import { warehouseListQueryOptions, warehouseOptionsWithoutCode } from "@/features/parties";

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
        <div>
          <Label
            id="movement-document-no-filter-label"
            htmlFor="movement-document-no-filter"
            className="block text-sm"
          >
            单据号
          </Label>
          <Input
            id="movement-document-no-filter"
            data-testid="movement-document-no-filter"
            className="mt-1 w-56"
            value={documentNoFilter}
            onChange={(event) => setDocumentNoFilter(event.target.value)}
            placeholder="按单据号筛选"
          />
        </div>

        <div>
          <Label
            id="movement-warehouse-filter-label"
            htmlFor="movement-warehouse-filter"
            className="block text-sm"
          >
            仓库
          </Label>
          <Picker
            id="movement-warehouse-filter"
            className="mt-1 w-48"
            value={warehouseFilter}
            onValueChange={setWarehouseFilter}
            options={[
              { value: "", label: "全部仓库" },
              ...warehouseOptionsWithoutCode(warehouses ?? []),
            ]}
            data-testid="movement-warehouse-filter"
            aria-labelledby="movement-warehouse-filter-label"
          />
        </div>

        <div>
          <Label
            id="movement-item-filter-label"
            htmlFor="movement-item-filter"
            className="block text-sm"
          >
            商品
          </Label>
          <Picker
            id="movement-item-filter"
            className="mt-1 w-48"
            value={itemFilter}
            onValueChange={setItemFilter}
            options={[{ value: "", label: "全部商品" }, ...itemOptions(items ?? [])]}
            data-testid="movement-item-filter"
            aria-labelledby="movement-item-filter-label"
          />
        </div>

        <div>
          <Label
            id="movement-line-no-filter-label"
            htmlFor="movement-line-no-filter"
            className="block text-sm"
          >
            行号
          </Label>
          <Input
            id="movement-line-no-filter"
            data-testid="movement-line-no-filter"
            className="mt-1 w-24"
            value={lineNoFilter}
            onChange={(event) => setLineNoFilter(event.target.value)}
            placeholder="行号"
          />
        </div>

        <div>
          <Label
            id="movement-from-filter-label"
            htmlFor="movement-from-filter"
            className="block text-sm"
          >
            起始时间
          </Label>
          <Input
            id="movement-from-filter"
            data-testid="movement-from-filter"
            type="datetime-local"
            className="mt-1 w-auto"
            value={fromFilter}
            onChange={(event) => setFromFilter(event.target.value)}
          />
        </div>

        <div>
          <Label
            id="movement-to-filter-label"
            htmlFor="movement-to-filter"
            className="block text-sm"
          >
            截止时间
          </Label>
          <Input
            id="movement-to-filter"
            data-testid="movement-to-filter"
            type="datetime-local"
            className="mt-1 w-auto"
            value={toFilter}
            onChange={(event) => setToFilter(event.target.value)}
          />
        </div>

        <div>
          <Label
            id="movement-order-filter-label"
            htmlFor="movement-order-filter"
            className="block text-sm"
          >
            排序方向
          </Label>
          <Picker
            id="movement-order-filter"
            className="mt-1 w-32"
            value={order}
            onValueChange={(value) => setOrder(value === "desc" ? "desc" : "asc")}
            options={movementOrderOptions()}
            data-testid="movement-order-filter"
            aria-labelledby="movement-order-filter-label"
          />
        </div>
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
