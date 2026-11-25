import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BreadcrumbChain } from "../lib/route-breadcrumbs";
import { RouteBreadcrumb } from "./route-breadcrumb";

const chain: BreadcrumbChain = {
  ancestors: [{ label: "商品档案", to: "/items" }],
  current: { label: "新建商品档案" },
};

function createTestRouter() {
  const rootRoute = createRootRoute();
  const itemsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/items" });
  return createRouter({
    routeTree: rootRoute.addChildren([itemsRoute]),
    history: createMemoryHistory(),
  });
}

function renderBreadcrumb(value: BreadcrumbChain): string {
  return renderToStaticMarkup(
    <RouterContextProvider router={createTestRouter()}>
      <RouteBreadcrumb chain={value} />
    </RouterContextProvider>,
  );
}

describe("面包屑渲染", () => {
  it("上级渲染成指向上级页面的链接", () => {
    const markup = renderBreadcrumb(chain);

    expect(markup).toMatch(/<a[^>]*href="\/items"/);
    expect(markup).toContain("商品档案");
  });

  it("只有上级是链接，当前页不是链接", () => {
    const markup = renderBreadcrumb(chain);

    expect(markup.match(/<a[\s>]/g) ?? []).toHaveLength(chain.ancestors.length);
    expect(markup).not.toMatch(/<a[^>]*>[^<]*新建商品档案/);
  });

  it("当前页渲染成不可点的纯文本", () => {
    const markup = renderBreadcrumb(chain);

    expect(markup).toMatch(/<span[^>]*aria-current="page"[^>]*>新建商品档案<\/span>/);
  });

  it("相邻层级之间渲染分隔符图标", () => {
    const markup = renderBreadcrumb(chain);

    expect(markup).toContain("chevron-right");
  });

  it("分隔符与层级项同级，不嵌在层级项里", () => {
    const markup = renderBreadcrumb(chain);

    expect(markup).toMatch(/<\/li><li[^>]*data-slot="breadcrumb-separator"/);
  });
});
