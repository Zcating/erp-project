import type { Page } from "@playwright/test";
import { expect, loginAsAdmin, pickOption, test, waitForDebugHandles } from "./fixtures";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const adminUsername = process.env.E2E_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "admin-dev-password";

let cachedCookie: string | null = null;

async function sessionCookie(): Promise<string> {
  if (cachedCookie !== null) {
    return cachedCookie;
  }
  const response = await fetch(`${apiBaseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) {
    throw new Error("登录响应没有下发 set-cookie");
  }
  cachedCookie = setCookie.split(";")[0] ?? "";
  return cachedCookie;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: any }> {
  const cookie = await sessionCookie();
  const headers: Record<string, string> = { cookie };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const text = await response.text();
  return { status: response.status, payload: text === "" ? undefined : JSON.parse(text) };
}

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

type MasterData = {
  supplierId: string;
  warehouseId: string;
  otherWarehouseId: string;
  itemId: string;
};

const createMasterData = async (): Promise<MasterData> => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("PW-INV-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-INV-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  const otherWarehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-INV-WH2"),
    name: "杭州分仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("PW-INV-SKU"),
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  });
  return {
    supplierId: supplier.payload.data.id as string,
    warehouseId: warehouse.payload.data.id as string,
    otherWarehouseId: otherWarehouse.payload.data.id as string,
    itemId: item.payload.data.id as string,
  };
};

const postPurchaseInbound = async (
  master: MasterData,
  targetWarehouseId: string,
  quantity: string,
): Promise<string> => {
  const created = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity, unitPrice: "1.115", amount: null }],
  });
  const documentId = created.payload.data.id as string;
  const posted = await api("POST", `/api/documents/${documentId}/post`);
  if (posted.status !== 200) {
    throw new Error(`入库过账失败：${JSON.stringify(posted.payload)}`);
  }
  return created.payload.data.documentNo as string;
};

const stockRowOf = (page: Page) => page.getByTestId("stock-row");

const postPurchaseInboundWithLines = async (
  master: MasterData,
  targetWarehouseId: string,
  quantities: readonly string[],
): Promise<string> => {
  const created = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId,
    warehouseId: null,
    lines: quantities.map((quantity) => ({
      itemId: master.itemId,
      quantity,
      unitPrice: "1.115",
      amount: null,
    })),
  });
  const documentId = created.payload.data.id as string;
  const posted = await api("POST", `/api/documents/${documentId}/post`);
  if (posted.status !== 200) {
    throw new Error(`入库过账失败：${JSON.stringify(posted.payload)}`);
  }
  return created.payload.data.documentNo as string;
};

const movementsOf = async (
  warehouseId: string,
): Promise<Array<{ documentNo: string; lineNo: number; occurredAt: string }>> => {
  const response = await api("GET", `/api/inventory/movements?warehouseId=${warehouseId}`);
  return response.payload.data.movements;
};

const localDateTimeValue = (instant: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
  const time = `${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}`;
  return `${day}T${time}`;
};

test("库存页分别显示账面、可用、在途三列，三列各取查询结果里的对应字段", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postPurchaseInbound(master, master.warehouseId, "12");

  await page.goto("/inventory");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("stock-warehouse-filter"), master.warehouseId);

  const row = stockRowOf(page).first();
  await expect(row.getByTestId("stock-on-hand")).toHaveText("12.000");
  await expect(row.getByTestId("stock-available")).toHaveText("12.000");
  await expect(row.getByTestId("stock-in-transit")).toHaveText("0.000");
});

test("切换仓库筛选后三列各自显示该仓库该商品的对应口径值，不残留上一仓库的数值", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postPurchaseInbound(master, master.warehouseId, "12");
  await postPurchaseInbound(master, master.otherWarehouseId, "5");

  await page.goto("/inventory");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("stock-warehouse-filter"), master.warehouseId);
  await expect(stockRowOf(page).first().getByTestId("stock-on-hand")).toHaveText("12.000");
  await expect(stockRowOf(page).first().getByTestId("stock-available")).toHaveText("12.000");
  await expect(stockRowOf(page).first().getByTestId("stock-in-transit")).toHaveText("0.000");

  await pickOption(page.getByTestId("stock-warehouse-filter"), master.otherWarehouseId);
  await expect(stockRowOf(page)).toHaveCount(1);
  await expect(stockRowOf(page).first().getByTestId("stock-on-hand")).toHaveText("5.000");
  await expect(stockRowOf(page).first().getByTestId("stock-available")).toHaveText("5.000");
  await expect(stockRowOf(page).first().getByTestId("stock-in-transit")).toHaveText("0.000");
  await expect(page.getByTestId("stock-table")).not.toContainText("12.000");
});

test("库存流水页显示每笔变动的单据号、行号与变动前后数量，并可按单据号过滤", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  const firstDocumentNo = await postPurchaseInbound(master, master.warehouseId, "12");
  const secondDocumentNo = await postPurchaseInbound(master, master.warehouseId, "5");

  await page.goto("/inventory/movements");
  await waitForDebugHandles(page);

  await expect(page.getByTestId("movement-row").filter({ hasText: firstDocumentNo })).toHaveCount(
    1,
  );
  await expect(page.getByTestId("movement-row").filter({ hasText: secondDocumentNo })).toHaveCount(
    1,
  );

  await page.getByTestId("movement-document-no-filter").fill(firstDocumentNo);
  await expect(page.getByTestId("movement-row")).toHaveCount(1);
  const row = page.getByTestId("movement-row").first();
  await expect(row.getByTestId("movement-document-no")).toHaveText(firstDocumentNo);
  await expect(row.getByTestId("movement-line-no")).toHaveText("1");
  await expect(row.getByTestId("movement-quantity-before")).toHaveText("0.000");
  await expect(row.getByTestId("movement-quantity-after")).toHaveText("12.000");
});

test("库存流水页选中「时间倒序」后，流水按发生时间倒序返回", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postPurchaseInbound(master, master.warehouseId, "12");
  await page.waitForTimeout(1_500);
  await postPurchaseInbound(master, master.warehouseId, "5");

  const movements = await movementsOf(master.warehouseId);
  expect(movements).toHaveLength(2);
  const earlier = movements[0]?.occurredAt ?? "";
  const later = movements[1]?.occurredAt ?? "";
  expect(earlier < later).toBe(true);

  await page.goto("/inventory/movements");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("movement-warehouse-filter"), master.warehouseId);

  await expect(
    page.getByTestId("movement-row").first().getByTestId("movement-occurred-at"),
  ).toHaveText(earlier);
  await expect(
    page.getByTestId("movement-row").last().getByTestId("movement-occurred-at"),
  ).toHaveText(later);

  await pickOption(page.getByTestId("movement-order-filter"), "desc");

  await expect(
    page.getByTestId("movement-row").first().getByTestId("movement-occurred-at"),
  ).toHaveText(later);
  await expect(
    page.getByTestId("movement-row").last().getByTestId("movement-occurred-at"),
  ).toHaveText(earlier);
});

test("库存流水页填入行号后，只剩该行号的流水", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postPurchaseInboundWithLines(master, master.warehouseId, ["3", "5"]);

  await page.goto("/inventory/movements");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("movement-warehouse-filter"), master.warehouseId);
  await expect(page.getByTestId("movement-row")).toHaveCount(2);
  await expect(page.getByTestId("movement-row").nth(0).getByTestId("movement-line-no")).toHaveText(
    "1",
  );
  await expect(page.getByTestId("movement-row").nth(1).getByTestId("movement-line-no")).toHaveText(
    "2",
  );

  await page.getByTestId("movement-line-no-filter").fill("2");

  await expect(page.getByTestId("movement-row")).toHaveCount(1);
  await expect(page.getByTestId("movement-row").first().getByTestId("movement-line-no")).toHaveText(
    "2",
  );
});

test("库存流水页填入起止时间区间后只剩区间内的流水，起始时间在所有流水之后时列表为空", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postPurchaseInbound(master, master.warehouseId, "12");
  await page.waitForTimeout(3_000);
  await postPurchaseInbound(master, master.warehouseId, "5");

  const movements = await movementsOf(master.warehouseId);
  expect(movements).toHaveLength(2);
  const earlier = movements[0]?.occurredAt ?? "";
  const boundary = localDateTimeValue(new Date(Date.parse(earlier) + 1_000));

  await page.goto("/inventory/movements");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("movement-warehouse-filter"), master.warehouseId);
  await expect(page.getByTestId("movement-row")).toHaveCount(2);

  await page.getByTestId("movement-from-filter").fill("2000-01-01T00:00");
  await page.getByTestId("movement-to-filter").fill(boundary);

  await expect(page.getByTestId("movement-row")).toHaveCount(1);
  await expect(
    page.getByTestId("movement-row").first().getByTestId("movement-occurred-at"),
  ).toHaveText(earlier);

  await page.getByTestId("movement-from-filter").fill("2100-01-01T00:00");

  await expect(page.getByTestId("movement-row")).toHaveCount(0);
  await expect(page.getByTestId("movement-empty")).toHaveText("没有匹配的库存流水");
});

test("库存页的筛选条件放在 jotai，服务端数据留在 TanStack Query 缓存里", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postPurchaseInbound(master, master.warehouseId, "12");

  await page.goto("/inventory");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("stock-warehouse-filter"), master.warehouseId);
  await expect(stockRowOf(page).first().getByTestId("stock-on-hand")).toHaveText("12.000");

  const uiState = await page.evaluate(() => window.__erpDebug!.readUiState());
  expect(uiState.stockWarehouseFilter).toBe(master.warehouseId);
  expect(uiState.stockItemFilter).toBe("");

  const cache = await page.evaluate(() => window.__erpDebug!.readQueryCache());
  const balances = cache.find((entry) => entry.queryKey[0] === "inventory");
  expect(balances).toBeDefined();
  expect(JSON.stringify(balances?.data)).toContain("onHand");
  expect(JSON.stringify(balances?.data)).toContain("available");
  expect(JSON.stringify(balances?.data)).toContain("inTransit");
  expect(JSON.stringify(balances?.data)).not.toContain('"quantity"');
});
