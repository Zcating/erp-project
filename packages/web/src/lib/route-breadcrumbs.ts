import type { FileRoutesById, FileRoutesByTo } from "@/routeTree.gen";

export type RouteId = keyof FileRoutesById;

export type RoutePath = keyof FileRoutesByTo;

export type BreadcrumbAncestor = {
  label: string;
  to: RoutePath;
};

export type BreadcrumbChain = {
  ancestors: readonly BreadcrumbAncestor[];
  current: { label: string };
};

type AdminRouteId = Exclude<RouteId, "__root__" | "/login">;

const ROUTE_LABELS = {
  overview: "总览",
  items: "商品档案",
  itemsNew: "新建商品档案",
  itemEdit: "编辑商品档案",
  documents: "单据",
  documentNew: "新建单据草稿",
  documentEdit: "编辑单据草稿",
  inventory: "库存查询",
  inventoryMovements: "库存流水",
  systemRoutes: "系统路由",
} as const;

const ROUTE_BREADCRUMBS: Record<AdminRouteId, BreadcrumbChain> = {
  "/": { ancestors: [], current: { label: ROUTE_LABELS.overview } },
  "/items/": { ancestors: [], current: { label: ROUTE_LABELS.items } },
  "/items/new": {
    ancestors: [{ label: ROUTE_LABELS.items, to: "/items" }],
    current: { label: ROUTE_LABELS.itemsNew },
  },
  "/items/$itemId/edit": {
    ancestors: [{ label: ROUTE_LABELS.items, to: "/items" }],
    current: { label: ROUTE_LABELS.itemEdit },
  },
  "/documents/": { ancestors: [], current: { label: ROUTE_LABELS.documents } },
  "/documents/new": {
    ancestors: [{ label: ROUTE_LABELS.documents, to: "/documents" }],
    current: { label: ROUTE_LABELS.documentNew },
  },
  "/documents/$documentId/edit": {
    ancestors: [{ label: ROUTE_LABELS.documents, to: "/documents" }],
    current: { label: ROUTE_LABELS.documentEdit },
  },
  "/inventory/": { ancestors: [], current: { label: ROUTE_LABELS.inventory } },
  "/inventory/movements": {
    ancestors: [{ label: ROUTE_LABELS.inventory, to: "/inventory" }],
    current: { label: ROUTE_LABELS.inventoryMovements },
  },
  "/system/routes": { ancestors: [], current: { label: ROUTE_LABELS.systemRoutes } },
};

export function breadcrumbForRoute(routeId: RouteId): BreadcrumbChain | undefined {
  if (routeId === "__root__" || routeId === "/login") {
    return undefined;
  }
  return ROUTE_BREADCRUMBS[routeId];
}

export function routeLabel(routeId: AdminRouteId): string {
  return ROUTE_BREADCRUMBS[routeId].current.label;
}
