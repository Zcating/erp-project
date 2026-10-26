import type { Page } from "@playwright/test";
import { expect, loginAsAdmin, test, waitForDebugHandles } from "./fixtures";

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
  itemId: string;
};

const createMasterData = async (): Promise<MasterData> => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("PW-STK-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-STK-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("PW-STK-SKU"),
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
    warehouseId: warehouse.payload.data.id as string,
    itemId: item.payload.data.id as string,
  };
};

const rowOf = (page: Page, documentNo: string) =>
  page.getByTestId("document-row").filter({ hasText: documentNo });

const balanceOf = async (master: MasterData): Promise<string | null> => {
  const response = await api(
    "GET",
    `/api/inventory/balances?warehouseId=${master.warehouseId}&itemId=${master.itemId}`,
  );
  const balances = response.payload.data.balances as Array<{ onHand: string }>;
  return balances[0]?.onHand ?? null;
};

const seedStock = async (master: MasterData): Promise<void> => {
  const inbound = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: master.warehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity: "12", unitPrice: "1.115", amount: null }],
  });
  const posted = await api("POST", `/api/documents/${inbound.payload.data.id as string}/post`);
  expect(posted.status).toBe(200);
};

test("盘点单在单据列表页复用通用过账与作废按钮，不新建盘点专属页面", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await seedStock(master);

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("STOCKTAKE");
  await page.getByTestId("document-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-line-item").first().selectOption(master.itemId);
  await page.getByTestId("document-line-quantity").first().fill("9");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const draftRow = rowOf(page, "STK-").first();
  const documentNo = await draftRow.getByTestId("document-no").textContent();
  const target = rowOf(page, documentNo ?? "");
  await expect(target.getByTestId("document-post")).toBeEnabled();
  await expect(target.getByTestId("document-void")).toBeDisabled();

  await target.getByTestId("document-post").click();
  await expect(target.getByTestId("posting-confirm")).toBeVisible();
  await target.getByTestId("posting-confirm-accept").click();

  await expect(target.getByTestId("document-status")).toHaveText("已过账");
  expect(await balanceOf(master)).toBe("9.000");
  const movements = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  expect(movements.payload.data.movements).toHaveLength(1);
  expect(movements.payload.data.movements[0].amount).toBe("3.35");

  await target.getByTestId("document-void").click();
  await expect(target.getByTestId("posting-confirm")).toBeVisible();
  await target.getByTestId("posting-confirm-accept").click();

  await expect(target.getByTestId("document-status")).toHaveText("已作废");
  expect(await balanceOf(master)).toBe("12.000");
  const afterVoid = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  expect(afterVoid.payload.data.movements).toHaveLength(2);
  expect(afterVoid.payload.data.movements[1].direction).toBe("REVERSAL");
  expect(afterVoid.payload.data.movements[1].amount).toBe("-3.35");
});
