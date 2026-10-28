import { describe, expect, it } from "vitest";
import { breadcrumbForRoute, type RouteId } from "./route-breadcrumbs";

type ExpectedChain = {
  ancestors: ReadonlyArray<{ label: string; to: string }>;
  current: string;
};

const EXPECTED_CHAINS: ReadonlyArray<{ routeId: RouteId; chain: ExpectedChain }> = [
  { routeId: "/", chain: { ancestors: [], current: "总览" } },
  { routeId: "/items/", chain: { ancestors: [], current: "商品档案" } },
  {
    routeId: "/items/new",
    chain: { ancestors: [{ label: "商品档案", to: "/items" }], current: "新建商品档案" },
  },
  {
    routeId: "/items/$itemId/edit",
    chain: { ancestors: [{ label: "商品档案", to: "/items" }], current: "编辑商品档案" },
  },
  { routeId: "/documents/", chain: { ancestors: [], current: "单据" } },
  {
    routeId: "/documents/new",
    chain: { ancestors: [{ label: "单据", to: "/documents" }], current: "新建单据草稿" },
  },
  {
    routeId: "/documents/$documentId/edit",
    chain: { ancestors: [{ label: "单据", to: "/documents" }], current: "编辑单据草稿" },
  },
  { routeId: "/inventory/", chain: { ancestors: [], current: "库存查询" } },
  {
    routeId: "/inventory/movements",
    chain: { ancestors: [{ label: "库存查询", to: "/inventory" }], current: "库存流水" },
  },
  { routeId: "/system/routes", chain: { ancestors: [], current: "系统路由" } },
];

describe("路由面包屑链", () => {
  it("根路由与登录路由没有面包屑", () => {
    expect(breadcrumbForRoute("__root__")).toBeUndefined();
    expect(breadcrumbForRoute("/login")).toBeUndefined();
  });

  it("后台路由各自返回预期的面包屑链", () => {
    for (const { routeId, chain } of EXPECTED_CHAINS) {
      expect(breadcrumbForRoute(routeId)).toEqual({
        ancestors: chain.ancestors,
        current: { label: chain.current },
      });
    }
  });
});
