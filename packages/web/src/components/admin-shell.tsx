import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AdminShell({ children }: { children: ReactNode }) {
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
              总览
            </Link>
          </li>
          <li>
            <Link
              to="/items"
              className="block rounded-md px-2 py-1 hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium" }}
            >
              商品档案
            </Link>
          </li>
          <li>
            <Link
              to="/system/routes"
              className="block rounded-md px-2 py-1 hover:bg-muted"
              activeProps={{ className: "bg-muted font-medium" }}
            >
              系统路由
            </Link>
          </li>
        </ul>
      </nav>
      <main data-testid="admin-main" className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}
