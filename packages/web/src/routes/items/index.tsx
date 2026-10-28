import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  displayConversionRate,
  itemDetailOpenAtom,
  itemKeywordAtom,
  itemListQueryKey,
  itemListQueryOptions,
  selectedItemIdAtom,
} from "@/features/items";
import { deleteItem, findItemByBarcode, type ItemMaster } from "@/server";

export const Route = createFileRoute("/items/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(itemListQueryOptions());
  },
  component: ItemListPage,
});

function ItemListPage() {
  const [keyword, setKeyword] = useAtom(itemKeywordAtom);
  const [selectedItemId, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const [detailOpen, setDetailOpen] = useAtom(itemDetailOpenAtom);
  const [barcode, setBarcode] = useState("");
  const [barcodeOutcome, setBarcodeOutcome] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [listError, setListError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: items, isPending } = useQuery(itemListQueryOptions());

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteItem({ data: { id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setListError(result.message);
        return;
      }
      setListError(null);
      if (selectedItemId !== null) {
        setSelectedItemId(null);
      }
      await queryClient.invalidateQueries({ queryKey: itemListQueryKey() });
    },
  });

  const barcodeMutation = useMutation({
    mutationFn: (code: string) => findItemByBarcode({ data: { barcode: code } }),
    onSuccess: (result) => {
      if (result.ok) {
        setBarcodeOutcome({
          ok: true,
          message: `找到档案：${result.item.code} ${result.item.name}`,
        });
        setSelectedItemId(result.item.id);
        setDetailOpen(true);
        return;
      }
      setBarcodeOutcome({ ok: false, message: result.message });
    },
    onError: (error) => {
      setBarcodeOutcome({
        ok: false,
        message: error instanceof Error ? error.message : "查询失败",
      });
    },
  });

  const visibleItems = (items ?? []).filter((item) => matches(item, keyword));
  const selectedItem = (items ?? []).find((item) => item.id === selectedItemId) ?? null;

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">商品档案</h1>
        <Link
          to="/items/new"
          data-testid="item-create-link"
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          新建商品档案
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="item-filter" className="block text-sm">
            筛选
          </Label>
          <Input
            id="item-filter"
            data-testid="item-filter"
            className="mt-1 w-64"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="按编码、名称或条码筛选"
          />
        </div>

        <div>
          <Label htmlFor="item-barcode-search" className="block text-sm">
            按商品条码查询
          </Label>
          <Input
            id="item-barcode-search"
            data-testid="item-barcode-search"
            className="mt-1 w-64"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder="输入商品条码"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          data-testid="item-barcode-search-submit"
          disabled={barcodeMutation.isPending}
          onClick={() => {
            setBarcodeOutcome(null);
            barcodeMutation.mutate(barcode);
          }}
        >
          查询
        </Button>
      </div>

      {barcodeOutcome === null ? null : (
        <p
          data-testid={barcodeOutcome.ok ? "item-barcode-result" : "item-barcode-error"}
          className="mb-4 text-sm text-muted-foreground"
        >
          {barcodeOutcome.message}
        </p>
      )}

      {listError === null ? null : (
        <p data-testid="item-list-error" className="mb-4 text-sm text-destructive">
          {listError}
        </p>
      )}

      <table className="w-full border-collapse text-sm" data-testid="item-table">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4">商品编码</th>
            <th className="py-2 pr-4">商品条码</th>
            <th className="py-2 pr-4">名称</th>
            <th className="py-2 pr-4">规格</th>
            <th className="py-2 pr-4">品牌</th>
            <th className="py-2 pr-4">商品分类</th>
            <th className="py-2 pr-4">基本计量单位</th>
            <th className="py-2 pr-4">辅助计量单位</th>
            <th className="py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item) => (
            <tr key={item.id} data-testid="item-row" className="border-b border-border/60">
              <td className="py-2 pr-4 font-mono" data-testid="item-code">
                {item.code}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="item-barcode">
                {item.barcode ?? "—"}
              </td>
              <td className="py-2 pr-4" data-testid="item-name">
                {item.name}
              </td>
              <td className="py-2 pr-4" data-testid="item-specification">
                {item.specification ?? "—"}
              </td>
              <td className="py-2 pr-4" data-testid="item-brand">
                {item.brand ?? "—"}
              </td>
              <td className="py-2 pr-4" data-testid="item-category">
                {item.category ?? "—"}
              </td>
              <td className="py-2 pr-4" data-testid="item-base-unit">
                {item.baseUnit}
              </td>
              <td className="py-2 pr-4" data-testid="item-auxiliary-units">
                {item.auxiliaryUnits.length === 0
                  ? "—"
                  : item.auxiliaryUnits
                      .map(
                        (auxiliaryUnit) =>
                          `${auxiliaryUnit.unit} × ${displayConversionRate(auxiliaryUnit.conversionRate)}`,
                      )
                      .join("；")}
              </td>
              <td className="py-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="item-select"
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setDetailOpen(true);
                    }}
                  >
                    选中
                  </Button>
                  <Link
                    to="/items/$itemId/edit"
                    params={{ itemId: item.id }}
                    data-testid="item-edit"
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    编辑
                  </Link>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    data-testid="item-delete"
                    onClick={() => removeMutation.mutate(item.id)}
                  >
                    删除
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isPending ? <p className="mt-4 text-sm text-muted-foreground">加载中…</p> : null}

      {visibleItems.length === 0 && !isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="item-empty">
          没有匹配的商品档案
        </p>
      ) : null}

      {detailOpen && selectedItem !== null ? (
        <section className="mt-6" data-testid="item-detail">
          <h2 className="mb-2 text-lg font-medium">选中项：{selectedItem.code}</h2>
          <p className="text-sm" data-testid="item-detail-name">
            名称：{selectedItem.name}
          </p>
          <p className="text-sm" data-testid="item-detail-specification">
            规格：{selectedItem.specification ?? "—"}
          </p>
          <p className="text-sm" data-testid="item-detail-brand">
            品牌：{selectedItem.brand ?? "—"}
          </p>
          <p className="text-sm" data-testid="item-detail-category">
            商品分类：{selectedItem.category ?? "—"}
          </p>
          <p className="text-sm" data-testid="item-detail-base-unit">
            基本计量单位：{selectedItem.baseUnit}
          </p>
          <ul className="text-sm" data-testid="item-detail-auxiliary-units">
            {selectedItem.auxiliaryUnits.map((auxiliaryUnit) => (
              <li key={auxiliaryUnit.unit} data-testid="item-detail-auxiliary-unit">
                {auxiliaryUnit.unit} × {displayConversionRate(auxiliaryUnit.conversionRate)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AdminShell>
  );
}

function matches(item: ItemMaster, keyword: string): boolean {
  const trimmed = keyword.trim();
  if (trimmed === "") {
    return true;
  }
  return (
    item.code.includes(trimmed) ||
    item.name.includes(trimmed) ||
    (item.barcode ?? "").includes(trimmed) ||
    (item.brand ?? "").includes(trimmed) ||
    (item.category ?? "").includes(trimmed)
  );
}
