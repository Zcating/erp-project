import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { systemRoutesQueryOptions } from "@/features/system/lib/queries";
import { detailPanelOpenAtom, routeFilterAtom, selectedRouteAtom } from "@/features/system/stores";

export const Route = createFileRoute("/system/routes")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(systemRoutesQueryOptions(""));
  },
  component: SystemRoutesPage,
});

function SystemRoutesPage() {
  const [filter, setFilter] = useAtom(routeFilterAtom);
  const [selectedRoute, setSelectedRoute] = useAtom(selectedRouteAtom);
  const [detailPanelOpen, setDetailPanelOpen] = useAtom(detailPanelOpenAtom);
  const { data, isPending } = useQuery(systemRoutesQueryOptions(filter));
  const routes = data?.routes ?? [];

  return (
    <AdminShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">系统路由</h1>
        <Button variant="outline" onClick={() => setDetailPanelOpen(!detailPanelOpen)}>
          {detailPanelOpen ? "收起详情" : "展开详情"}
        </Button>
      </div>

      <label className="mb-4 block text-sm" htmlFor="route-filter">
        筛选
        <input
          id="route-filter"
          data-testid="route-filter"
          className="mt-1 block w-64 rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="按路径或方法筛选"
        />
      </label>

      <table className="w-full border-collapse text-sm" data-testid="route-table">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4">方法</th>
            <th className="py-2">路径</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr
              key={`${route.method} ${route.url}`}
              data-testid="route-row"
              className="border-b border-border/60"
            >
              <td className="py-2 pr-4 font-mono">{route.method}</td>
              <td className="py-2 font-mono">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-left hover:bg-muted"
                  onClick={() => setSelectedRoute(route.url)}
                >
                  {route.url}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isPending ? <p className="mt-4 text-sm text-muted-foreground">加载中…</p> : null}

      {routes.length === 0 && !isPending ? (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="route-empty">
          没有匹配的路由
        </p>
      ) : null}

      {detailPanelOpen ? (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="route-detail">
          选中项：{selectedRoute ?? "无"}
        </p>
      ) : null}
    </AdminShell>
  );
}
