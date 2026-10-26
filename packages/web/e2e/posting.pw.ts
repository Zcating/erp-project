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
    code: uniqueCode("PW-POST-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-POST-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("PW-POST-SKU"),
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
  const balances = response.payload.data.balances as Array<{ quantity: string }>;
  return balances[0]?.quantity ?? null;
};

test("草稿态过账可用、作废禁用，已过账态过账禁用、作废可用，已作废态两者都禁用", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-line-item").first().selectOption(master.itemId);
  await page.getByTestId("document-line-quantity").first().fill("12");
  await page.getByTestId("document-line-unit-price").first().fill("1.115");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const draftRow = rowOf(page, "PIN-").first();
  const documentNo = await draftRow.getByTestId("document-no").textContent();
  const target = rowOf(page, documentNo ?? "");
  await expect(target.getByTestId("document-post")).toBeEnabled();
  await expect(target.getByTestId("document-void")).toBeDisabled();

  await target.getByTestId("document-post").click();
  await expect(target.getByTestId("posting-confirm")).toBeVisible();
  await target.getByTestId("posting-confirm-accept").click();

  await expect(target.getByTestId("document-status")).toHaveText("已过账");
  await expect(target.getByTestId("document-post")).toBeDisabled();
  await expect(target.getByTestId("document-void")).toBeEnabled();

  await target.getByTestId("document-void").click();
  await expect(target.getByTestId("posting-confirm")).toBeVisible();
  await target.getByTestId("posting-confirm-accept").click();

  await expect(target.getByTestId("document-status")).toHaveText("已作废");
  await expect(target.getByTestId("document-post")).toBeDisabled();
  await expect(target.getByTestId("document-void")).toBeDisabled();
});

test("点击过账弹出二次确认，取消后不发请求且库存不变", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-line-item").first().selectOption(master.itemId);
  await page.getByTestId("document-line-quantity").first().fill("12");
  await page.getByTestId("document-line-unit-price").first().fill("1.115");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const draftRow = rowOf(page, "PIN-").first();
  const documentNo = await draftRow.getByTestId("document-no").textContent();
  const target = rowOf(page, documentNo ?? "");

  await target.getByTestId("document-post").click();
  await expect(target.getByTestId("posting-confirm")).toBeVisible();
  await target.getByTestId("posting-cancel").click();

  await expect(target.getByTestId("posting-confirm")).toHaveCount(0);
  await expect(target.getByTestId("document-status")).toHaveText("草稿");
  expect(await balanceOf(master)).toBeNull();

  const document = await api("GET", "/api/documents?type=PURCHASE_INBOUND&status=DRAFT");
  const drafts = document.payload.data.documents as Array<{ documentNo: string }>;
  expect(drafts.some((entry) => entry.documentNo === documentNo)).toBe(true);
});

test("确认过账后库存增加，作废后库存回到过账前", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-line-item").first().selectOption(master.itemId);
  await page.getByTestId("document-line-quantity").first().fill("12");
  await page.getByTestId("document-line-unit-price").first().fill("1.115");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const draftRow = rowOf(page, "PIN-").first();
  const documentNo = await draftRow.getByTestId("document-no").textContent();
  const target = rowOf(page, documentNo ?? "");

  await target.getByTestId("document-post").click();
  await target.getByTestId("posting-confirm-accept").click();
  await expect(target.getByTestId("document-status")).toHaveText("已过账");
  expect(await balanceOf(master)).toBe("12.000");

  const movements = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  expect(movements.payload.data.movements).toHaveLength(1);
  expect(movements.payload.data.movements[0].amount).toBe("13.38");

  await target.getByTestId("document-void").click();
  await target.getByTestId("posting-confirm-accept").click();
  await expect(target.getByTestId("document-status")).toHaveText("已作废");
  expect(await balanceOf(master)).toBe("0.000");

  const afterVoid = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  expect(afterVoid.payload.data.movements).toHaveLength(2);
  expect(afterVoid.payload.data.movements[1].direction).toBe("REVERSAL");
});

test("按辅助计量单位录入 1 箱并过账后账面库存增加 12 而不是 1", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-line-item").first().selectOption(master.itemId);
  await page.getByTestId("document-line-unit").first().selectOption("箱");
  await page.getByTestId("document-line-quantity").first().fill("1");
  await page.getByTestId("document-line-unit-price").first().fill("1.115");
  await expect(page.getByTestId("document-line-amount").first()).toHaveText("13.38");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const draftRow = rowOf(page, "PIN-").first();
  const documentNo = await draftRow.getByTestId("document-no").textContent();
  const target = rowOf(page, documentNo ?? "");
  await target.getByTestId("document-post").click();
  await target.getByTestId("posting-confirm-accept").click();
  await expect(target.getByTestId("document-status")).toHaveText("已过账");

  expect(await balanceOf(master)).toBe("12.000");
});
