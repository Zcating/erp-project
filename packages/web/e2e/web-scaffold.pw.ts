import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { loginAsAdmin, waitForDebugHandles } from "./fixtures";
import type { DebugQueryEntry, UiStateSnapshot } from "./fixtures";

async function readUiState(page: Page): Promise<UiStateSnapshot> {
  await waitForDebugHandles(page);
  return page.evaluate(() => window.__erpDebug!.readUiState());
}

async function readQueryCache(page: Page): Promise<Array<DebugQueryEntry>> {
  await waitForDebugHandles(page);
  return page.evaluate(() => window.__erpDebug!.readQueryCache());
}

const SERVER_FN_PATH = "/_serverFn/";

async function readClientRouteUrls(page: Page): Promise<Array<string>> {
  return page.locator('[data-testid="route-row"] td:nth-of-type(2)').allInnerTexts();
}

test("根路径返回 200 并渲染管理后台骨架", async ({ page }) => {
  await loginAsAdmin(page);

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("admin-nav")).toBeVisible();
  await expect(page.getByTestId("admin-main")).toBeVisible();
  await expect(page.getByRole("button", { name: "新建单据" })).toBeVisible();
});

test("Tailwind 工具类在计算样式上生效", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/");

  const mainPadding = await page
    .getByTestId("admin-main")
    .evaluate((element) => getComputedStyle(element).paddingTop);
  expect(mainPadding).not.toBe("0px");

  const reference = await page.evaluate(() => {
    const probe = document.createElement("button");
    const style = getComputedStyle(probe);
    return {
      radius: style.borderTopLeftRadius,
      border: `${style.borderTopStyle} ${style.borderTopWidth}`,
    };
  });
  const actual = await page.getByRole("button", { name: "新建单据" }).evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      radius: style.borderTopLeftRadius,
      border: `${style.borderTopStyle} ${style.borderTopWidth}`,
    };
  });

  expect(actual.radius).not.toBe(reference.radius);
  expect(actual.border).not.toBe(reference.border);
});

test("列表页能打开并渲染列表骨架，不出现报错页", async ({ page }) => {
  await loginAsAdmin(page);

  const response = await page.goto("/system/routes");

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("route-table")).toBeVisible();
  await expect(page.getByTestId("route-row").first()).toBeVisible();
  await expect(page.getByTestId("route-empty")).toHaveCount(0);
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
});

test("浏览器发出的业务请求只指向前端自身地址", async ({ page }) => {
  await loginAsAdmin(page);

  const requests: Array<string> = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await page.goto("/system/routes");
  await waitForDebugHandles(page);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("route-row").first()).toBeVisible();
  const origin = new URL(page.url()).origin;
  const foreign = requests.filter(
    (url) => !url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:"),
  );
  expect(foreign).toEqual([]);
  expect(requests.filter((url) => url.includes(":3000") || url.includes(":5432"))).toEqual([]);
});

test("SSR 阶段取数走同一个 Fastify API，输出内容与浏览器端一致", async ({ page }) => {
  await loginAsAdmin(page);

  const ssrResponse = await page.request.get("/system/routes");
  expect(ssrResponse.status()).toBe(200);
  const ssrHtml = await ssrResponse.text();
  const ssrUrls = [...ssrHtml.matchAll(/<button[^>]*>(\/api\/[^<]*)<\/button>/g)].map(
    (match) => match[1] ?? "",
  );
  expect(ssrUrls.length).toBeGreaterThan(0);
  expect(ssrUrls).toContain("/api/health");

  await page.goto("/system/routes");
  await expect(page.getByTestId("route-row").first()).toBeVisible();

  const clientUrls = await readClientRouteUrls(page);
  expect(clientUrls).toEqual(ssrUrls);

  const uiState = await readUiState(page);
  const currentFilter = uiState.routeFilter;
  const cacheEntries = (await readQueryCache(page)).filter(
    (entry) =>
      entry.queryKey[0] === "system" &&
      entry.queryKey[1] === "routes" &&
      entry.queryKey[2] === currentFilter,
  );
  expect(cacheEntries.length).toBe(1);
  const cachedRoutes = (
    cacheEntries[0] as DebugQueryEntry & {
      data: { routes: Array<{ url: string }> };
    }
  ).data.routes;
  expect(cachedRoutes.map((route) => route.url)).toEqual(ssrUrls);
});

test("前端状态容器里只有界面状态，不含服务端数据", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/system/routes");
  await expect(page.getByTestId("route-row").first()).toBeVisible();

  const uiState = await readUiState(page);
  const values = Object.values(uiState);

  expect(values.length).toBeGreaterThan(0);
  for (const value of values) {
    expect(value === null || ["string", "number", "boolean"].includes(typeof value)).toBe(true);
  }
  expect(JSON.stringify(uiState)).not.toContain("/api/");
});

test("列表只由查询缓存层持有一份，切换筛选由缓存层重新请求", async ({ page }) => {
  await loginAsAdmin(page);

  const serverFnRequests: Array<string> = [];
  page.on("request", (request) => {
    if (request.url().includes(SERVER_FN_PATH)) {
      serverFnRequests.push(request.url());
    }
  });

  await page.goto("/system/routes");
  await expect(page.getByTestId("route-row").first()).toBeVisible();

  const listEntriesBefore = (await readQueryCache(page)).filter(
    (entry) => entry.queryKey[0] === "system" && entry.queryKey[1] === "routes",
  );
  expect(listEntriesBefore.length).toBe(1);
  expect(
    Array.isArray(
      (listEntriesBefore[0] as DebugQueryEntry & { data: { routes: unknown } }).data.routes,
    ),
  ).toBe(true);

  const requestsBefore = serverFnRequests.length;
  await page.getByTestId("route-filter").fill("system");
  await expect(page.getByTestId("route-row").first()).toBeVisible();
  await expect
    .poll(() => serverFnRequests.length, { timeout: 15_000 })
    .toBeGreaterThan(requestsBefore);

  const listEntriesAfter = (await readQueryCache(page)).filter(
    (entry) => entry.queryKey[0] === "system" && entry.queryKey[1] === "routes",
  );
  expect(listEntriesAfter.length).toBe(2);
  expect(new Set(listEntriesAfter.map((entry) => JSON.stringify(entry.queryKey))).size).toBe(2);
  expect(JSON.stringify(await readUiState(page))).not.toContain("/api/");
});
