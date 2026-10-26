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
  customerId: string;
  warehouseId: string;
  otherWarehouseId: string;
  itemId: string;
};

const createMasterData = async (): Promise<MasterData> => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("PW-DOC-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customer = await api("POST", "/api/customers", {
    code: uniqueCode("PW-DOC-CUS"),
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-DOC-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  const otherWarehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-DOC-WH2"),
    name: "杭州分仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("PW-DOC-SKU"),
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
    customerId: customer.payload.data.id as string,
    warehouseId: warehouse.payload.data.id as string,
    otherWarehouseId: otherWarehouse.payload.data.id as string,
    itemId: item.payload.data.id as string,
  };
};

const rowOf = (page: Page, typeLabel: string) =>
  page.getByTestId("document-row").filter({ hasText: typeLabel });

async function fillLine(
  page: Page,
  master: MasterData,
  values: { quantity: string; unitPrice?: string },
): Promise<void> {
  await page.getByTestId("document-line-item").first().selectOption(master.itemId);
  await page.getByTestId("document-line-quantity").first().fill(values.quantity);
  if (values.unitPrice !== undefined) {
    await page.getByTestId("document-line-unit-price").first().fill(values.unitPrice);
  }
}

test("未登录访问单据列表页被送到登录页且看不到业务数据", async ({ page }) => {
  await page.goto("/documents");

  await expect(page).toHaveURL(/\/login\?next=%2Fdocuments/);
  await expect(page.getByTestId("login-form")).toBeVisible();
  await expect(page.getByTestId("document-table")).toHaveCount(0);
});

test("单据新建入口提供采购入库单、销售出库单、销售退货单、盘点单、调拨单五种类型", async ({
  page,
}) => {
  await loginAsAdmin(page);

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await expect(page.getByTestId("document-type")).toBeVisible();

  const options = await page.getByTestId("document-type").locator("option").allTextContents();
  expect(options).toEqual(["采购入库单", "销售出库单", "销售退货单", "盘点单", "调拨单"]);
  expect(options).not.toContain("采购退货单");
});

test("新建采购入库单草稿后列表页出现单号与草稿状态", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "3", unitPrice: "1.115" });
  await page.getByTestId("document-submit").click();

  await expect(page).toHaveURL(/\/documents$/);
  const row = rowOf(page, "采购入库单").first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("document-no")).toHaveText(/^PIN-\d{8}-\d{3}$/);
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
});

test("新建销售出库单草稿时能选到客户与来源仓库", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("SALE_OUTBOUND");
  await expect(page.getByTestId("document-customer")).toBeVisible();
  await expect(page.getByTestId("document-source-warehouse")).toBeVisible();
  await page.getByTestId("document-customer").selectOption(master.customerId);
  await page.getByTestId("document-source-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "1", unitPrice: "2" });
  await page.getByTestId("document-submit").click();

  await expect(page).toHaveURL(/\/documents$/);
  const row = rowOf(page, "销售出库单").first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("document-no")).toHaveText(/^SOUT-\d{8}-\d{3}$/);
});

test("新建盘点单草稿时能选到仓库并只录商品与实盘数量", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("STOCKTAKE");
  await expect(page.getByTestId("document-warehouse")).toBeVisible();
  await expect(page.getByTestId("document-line-unit-price")).toHaveCount(0);
  await page.getByTestId("document-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "0" });
  await page.getByTestId("document-submit").click();

  await expect(page).toHaveURL(/\/documents$/);
  const row = rowOf(page, "盘点单").first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("document-no")).toHaveText(/^STK-\d{8}-\d{3}$/);
});

test("新建调拨单草稿时能选到源仓与目标仓", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("TRANSFER");
  await page.getByTestId("document-source-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-target-warehouse").selectOption(master.otherWarehouseId);
  await fillLine(page, master, { quantity: "2", unitPrice: "1.5" });
  await page.getByTestId("document-submit").click();

  await expect(page).toHaveURL(/\/documents$/);
  const row = rowOf(page, "调拨单").first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("document-no")).toHaveText(/^TRF-\d{8}-\d{3}$/);
});

test("单据行金额按金额精度回显：单价 1.115、数量 3 得 3.35，数量改成 4 得 4.46", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "3", unitPrice: "1.115" });
  await expect(page.getByTestId("document-line-amount").first()).toHaveText("3.35");
  await page.getByTestId("document-submit").click();

  await expect(page).toHaveURL(/\/documents$/);
  const row = rowOf(page, "采购入库单").first();
  await expect(row.getByTestId("document-amounts")).toHaveText("3.35");

  await row.getByTestId("document-edit").click();
  await expect(page.getByTestId("document-form")).toBeVisible();
  await expect(page.getByTestId("document-line-amount").first()).toHaveText("3.35");

  await page.getByTestId("document-line-quantity").first().fill("4");
  await expect(page.getByTestId("document-line-amount").first()).toHaveText("4.46");
  await page.getByTestId("document-submit").click();

  await expect(page).toHaveURL(/\/documents$/);
  await expect(rowOf(page, "采购入库单").first().getByTestId("document-amounts")).toHaveText(
    "4.46",
  );
});

test("缺少供应商时表单显示后端给出的错误消息", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "1", unitPrice: "1" });
  await page.getByTestId("document-submit").click();

  await expect(page.getByTestId("document-form-error")).toHaveText("缺少供应商");
});

test("源仓与目标仓相同的调拨单保存失败并给出明确提示", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("TRANSFER");
  await page.getByTestId("document-source-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "1", unitPrice: "1" });
  await page.getByTestId("document-submit").click();

  await expect(page.getByTestId("document-form-error")).toHaveText("源仓与目标仓必须不同");
});

test("删除草稿后单据列表里不再显示该条草稿", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "1", unitPrice: "1" });
  await page.getByTestId("document-submit").click();

  await expect(page).toHaveURL(/\/documents$/);
  const row = rowOf(page, "采购入库单").first();
  const documentNo = await row.getByTestId("document-no").textContent();

  await row.getByTestId("document-delete").click();

  await expect(page.getByTestId("document-row").filter({ hasText: documentNo ?? "" })).toHaveCount(
    0,
  );
});

test("按单据类型筛选时列表里只剩该类型的单据", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("STOCKTAKE");
  await page.getByTestId("document-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "1" });
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  await page.goto("/documents");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type-filter").selectOption("STOCKTAKE");

  const rows = page.getByTestId("document-row");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);
  for (const text of await rows.allTextContents()) {
    expect(text).toContain("盘点单");
  }
});

test("单据列表只由查询缓存持有，界面状态里没有服务端数据", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await fillLine(page, master, { quantity: "1", unitPrice: "1" });
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const documentNo = await rowOf(page, "采购入库单")
    .first()
    .getByTestId("document-no")
    .textContent();

  const cacheEntries = await page.evaluate(() => window.__erpDebug!.readQueryCache());
  const listEntries = cacheEntries.filter(
    (entry) => entry.queryKey[0] === "documents" && entry.queryKey[1] === "list",
  );
  expect(listEntries.length).toBeGreaterThan(0);

  const uiState = await page.evaluate(() => window.__erpDebug!.readUiState());
  expect(JSON.stringify(uiState)).not.toContain("/api/");
  expect(JSON.stringify(uiState)).not.toContain(documentNo ?? "never-matches");
});
