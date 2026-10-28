import { describe, expect, it } from "vitest";
import {
  breadcrumbForRoute,
  routeLabel,
  type BreadcrumbChain,
  type RouteId,
} from "./route-breadcrumbs";

const EXPECTED_CHAINS: ReadonlyArray<{ routeId: RouteId; chain: BreadcrumbChain }> = [
  { routeId: "/", chain: { ancestors: [], current: { label: "总览" } } },
  { routeId: "/items/", chain: { ancestors: [], current: { label: "商品档案" } } },
  {
    routeId: "/items/new",
    chain: {
      ancestors: [{ label: "商品档案", to: "/items" }],
      current: { label: "新建商品档案" },
    },
  },
  {
    routeId: "/items/$itemId/edit",
    chain: {
      ancestors: [{ label: "商品档案", to: "/items" }],
      current: { label: "编辑商品档案" },
    },
  },
  { routeId: "/documents/", chain: { ancestors: [], current: { label: "单据" } } },
  {
    routeId: "/documents/new",
    chain: {
      ancestors: [{ label: "单据", to: "/documents" }],
      current: { label: "新建单据草稿" },
    },
  },
  {
    routeId: "/documents/$documentId/edit",
    chain: {
      ancestors: [{ label: "单据", to: "/documents" }],
      current: { label: "编辑单据草稿" },
    },
  },
  { routeId: "/inventory/", chain: { ancestors: [], current: { label: "库存查询" } } },
  {
    routeId: "/inventory/movements",
    chain: {
      ancestors: [{ label: "库存查询", to: "/inventory" }],
      current: { label: "库存流水" },
    },
  },
  { routeId: "/system/routes", chain: { ancestors: [], current: { label: "系统路由" } } },
];

describe("路由面包屑链", () => {
  it("根路由与登录路由没有面包屑", () => {
    expect(breadcrumbForRoute("__root__")).toBeUndefined();
    expect(breadcrumbForRoute("/login")).toBeUndefined();
  });

  it("后台路由各自返回预期的面包屑链", () => {
    for (const { routeId, chain } of EXPECTED_CHAINS) {
      expect(breadcrumbForRoute(routeId)).toEqual(chain);
    }
  });

  it("链的末项是当前页且没有链接目标，上级都有链接目标", () => {
    for (const { routeId } of EXPECTED_CHAINS) {
      const chain = breadcrumbForRoute(routeId);

      expect(chain).toBeDefined();
      expect(chain?.current).not.toHaveProperty("to");
      for (const ancestor of chain?.ancestors ?? []) {
        expect(ancestor.to).toBeTypeOf("string");
      }
    }
  });

  it("侧边栏导航的标签与面包屑链的当前页标签同源", () => {
    expect(routeLabel("/")).toBe("总览");
    expect(routeLabel("/items/")).toBe("商品档案");
    expect(routeLabel("/documents/")).toBe("单据");
    expect(routeLabel("/inventory/")).toBe("库存查询");
    expect(routeLabel("/inventory/movements")).toBe("库存流水");
    expect(routeLabel("/system/routes")).toBe("系统路由");
  });
});
