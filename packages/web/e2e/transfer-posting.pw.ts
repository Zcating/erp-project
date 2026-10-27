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
  sourceWarehouseId: string;
  targetWarehouseId: string;
  itemId: string;
  itemCode: string;
};

const createMasterData = async (): Promise<MasterData> => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("PW-TRF-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const sourceWarehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-TRF-WH-SRC"),
    name: "杭州总仓",
    purpose: null,
  });
  const targetWarehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-TRF-WH-TGT"),
    name: "杭州分仓",
    purpose: null,
  });
  const itemCode = uniqueCode("PW-TRF-SKU");
  const item = await api("POST", "/api/items", {
    code: itemCode,
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  });
  return {
    supplierId: supplier.payload.data.id as string,
    sourceWarehouseId: sourceWarehouse.payload.data.id as string,
    targetWarehouseId: targetWarehouse.payload.data.id as string,
    itemId: item.payload.data.id as string,
    itemCode,
  };
};

const seedSourceStock = async (master: MasterData): Promise<void> => {
  const inbound = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: master.sourceWarehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity: "10", unitPrice: "2.5", amount: null }],
  });
  expect(inbound.status).toBe(200);
  const posted = await api("POST", `/api/documents/${inbound.payload.data.id}/post`);
  expect(posted.status).toBe(200);
};

const transferRow = (page: Page) =>
  page.getByTestId("document-row").filter({ hasText: "TRF-" }).first();

test("调拨单在列表页能发起调出与调入两个阶段的过账，按钮可用性随阶段变化", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await seedSourceStock(master);

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("document-type"), "TRANSFER");
  await pickOption(page.getByTestId("document-source-warehouse"), master.sourceWarehouseId);
  await pickOption(page.getByTestId("document-target-warehouse"), master.targetWarehouseId);
  await pickOption(page.getByTestId("document-line-item").first(), master.itemId);
  await page.getByTestId("document-line-quantity").first().fill("4");
  await page.getByTestId("document-line-unit-price").first().fill("2.5");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const row = transferRow(page);
  await expect(row.getByTestId("document-post-out")).toBeEnabled();
  await expect(row.getByTestId("document-post-in")).toBeDisabled();
  await expect(row.getByTestId("document-void")).toBeDisabled();

  await row.getByTestId("document-post-out").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-confirm-accept").click();

  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  await expect(row.getByTestId("document-post-out")).toBeDisabled();
  await expect(row.getByTestId("document-post-in")).toBeEnabled();
  await expect(row.getByTestId("document-void")).toBeEnabled();

  await page.goto("/inventory");
  const stockRow = page.getByTestId("stock-row").filter({ hasText: master.itemCode }).first();
  await expect(stockRow.getByTestId("stock-on-hand")).toHaveText("6.000");
  await expect(stockRow.getByTestId("stock-in-transit")).toHaveText("4.000");
});

test("调入过账后这批数量不再计入在途，两个过账按钮都不能再发起，作废仍可用", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await seedSourceStock(master);

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("document-type"), "TRANSFER");
  await pickOption(page.getByTestId("document-source-warehouse"), master.sourceWarehouseId);
  await pickOption(page.getByTestId("document-target-warehouse"), master.targetWarehouseId);
  await pickOption(page.getByTestId("document-line-item").first(), master.itemId);
  await page.getByTestId("document-line-quantity").first().fill("4");
  await page.getByTestId("document-line-unit-price").first().fill("2.5");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const row = transferRow(page);
  await row.getByTestId("document-post-out").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-post-in")).toBeEnabled();

  await row.getByTestId("document-post-in").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-confirm-accept").click();

  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  await expect(row.getByTestId("document-post-out")).toBeDisabled();
  await expect(row.getByTestId("document-post-in")).toBeDisabled();
  await expect(row.getByTestId("document-void")).toBeEnabled();

  await page.goto("/inventory");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("stock-warehouse-filter"), master.sourceWarehouseId);
  const stockRow = page.getByTestId("stock-row").filter({ hasText: master.itemCode });
  await expect(stockRow).toHaveCount(1);
  await expect(stockRow.getByTestId("stock-on-hand")).toHaveText("6.000");
  await expect(stockRow.getByTestId("stock-in-transit")).toHaveText("0.000");
});
