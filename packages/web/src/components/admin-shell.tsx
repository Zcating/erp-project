import { Link, useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RouteBreadcrumb } from "@/components/route-breadcrumb";
import { breadcrumbForRoute, routeLabel } from "@/lib/route-breadcrumbs";

export function AdminShell({ children }: { children: ReactNode }) {
  const matches = useMatches();
  const currentRouteId = matches[matches.length - 1]?.routeId;
  const chain = currentRouteId === undefined ? undefined : breadcrumbForRoute(currentRouteId);

  return (
    <div className="flex min-h-screen">
      <nav data-testid="admin-nav" className="w-64 shrink-0 border-r border-border bg-muted/40 p-4">
        <p className="mb-4 text-lg font-semibold">进销存管理后台</p>
        <ul className="space-y-1 text-sm">
          <li>
            <Link
              to="/"
              className="block rounded-md px-2 py-1 hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium" }}
              activeOptions={{ exact: true }}
            >
              {routeLabel("/")}
            </Link>
          </li>
          <li>
            <Link
              to="/items"
              className="block rounded-md px-2 py-1 hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium" }}
            >
              {routeLabel("/items/")}
            </Link>
          </li>
          <li>
            <Link
              to="/documents"
              className="block rounded-md px-2 py-1 hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium" }}
            >
              {routeLabel("/documents/")}
            </Link>
          </li>
          <li>
            <Link
              to="/inventory"
              className="block rounded-md px-2 py-1 hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium" }}
            >
              {routeLabel("/inventory/")}
            </Link>
          </li>
          <li>
            <Link
              to="/inventory/movements"
              className="block rounded-md px-2 py-1 hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium" }}
            >
              {routeLabel("/inventory/movements")}
            </Link>
          </li>
          <li>
            <Link
              to="/system/routes"
              className="block rounded-md px-2 py-1 hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium" }}
            >
              {routeLabel("/system/routes")}
            </Link>
          </li>
        </ul>
      </nav>
      <main data-testid="admin-main" className="flex-1 p-6">
        {chain === undefined ? null : <RouteBreadcrumb chain={chain} />}
        {children}
      </main>
    </div>
  );
}
