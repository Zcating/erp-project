import type { Page } from "@playwright/test";
import {
  countSubmitRequests,
  expect,
  loginAsAdmin,
  pickOption,
  pickOptionByLabel,
  pickOptionLabels,
  test,
  waitForDebugHandles,
} from "./fixtures";

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
  warehouseCode: string;
  itemId: string;
  itemCode: string;
};

const createMasterData = async (): Promise<MasterData> => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("PW-PRET-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customer = await api("POST", "/api/customers", {
    code: uniqueCode("PW-PRET-CUS"),
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouseCode = uniqueCode("PW-PRET-WH");
  const warehouse = await api("POST", "/api/warehouses", {
    code: warehouseCode,
    name: "杭州总仓",
    purpose: null,
  });
  const itemCode = uniqueCode("PW-PRET-SKU");
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
    customerId: customer.payload.data.id as string,
    warehouseId: warehouse.payload.data.id as string,
    warehouseCode,
    itemId: item.payload.data.id as string,
    itemCode,
  };
};

const createPostedInbound = async (
  master: MasterData,
): Promise<{ documentNo: string; lineId: string }> => {
  const inbound = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: master.warehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity: "10", unitPrice: "2", amount: null }],
  });
  const posted = await api("POST", `/api/documents/${inbound.payload.data.id}/post`);
  if (posted.status !== 200) {
    throw new Error(`入库过账失败：${JSON.stringify(posted.payload)}`);
  }
  return {
    documentNo: inbound.payload.data.documentNo as string,
    lineId: inbound.payload.data.lines[0].id as string,
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

test("采购退货单能在新建页选择原采购入库行，过账后库存减少、作废后回退", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  const inbound = await createPostedInbound(master);

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("document-type"), "PURCHASE_RETURN");
  const originalLabels = await pickOptionLabels(page.getByTestId("document-line-original").first());
  expect(
    originalLabels.filter((label) => label.includes(`${inbound.documentNo} 第 1 行`)),
  ).toHaveLength(1);
  await pickOptionByLabel(
    page.getByTestId("document-line-original").first(),
    `${inbound.documentNo} 第 1 行`,
  );
  await page.getByTestId("document-line-quantity").first().fill("4");
  await expect(page.getByTestId("document-source-warehouse")).toHaveText(
    `${master.warehouseCode} 杭州总仓`,
  );
  await expect(page.getByTestId("document-source-warehouse")).toBeDisabled();
  await expect(page.getByTestId("document-line-item").first()).toHaveText(
    `${master.itemCode} 可口可乐`,
  );
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const draftRow = page.getByTestId("document-row").filter({ hasText: "PRET-" }).first();
  const documentNo = (await draftRow.getByTestId("document-no").textContent()) ?? "";
  const target = rowOf(page, documentNo);
  await expect(target.getByTestId("document-type")).toHaveText("采购退货单");

  await target.getByTestId("document-post").click();
  await target.getByTestId("posting-confirm-accept").click();

  await expect(target.getByTestId("document-status")).toHaveText("已过账");
  expect(await balanceOf(master)).toBe("6.000");

  const movements = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  expect(movements.payload.data.movements).toHaveLength(1);
  expect(movements.payload.data.movements[0].amount).toBe("8.00");
  expect(movements.payload.data.movements[0].unitPrice).toBe("2.000000");

  await target.getByTestId("document-void").click();
  await target.getByTestId("posting-confirm-accept").click();

  await expect(target.getByTestId("document-status")).toHaveText("已作废");
  expect(await balanceOf(master)).toBe("10.000");

  const afterVoid = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  expect(afterVoid.payload.data.movements).toHaveLength(2);
  expect(afterVoid.payload.data.movements[1].direction).toBe("REVERSAL");
  expect(afterVoid.payload.data.movements[1].amount).toBe("-8.00");
});

test("采购退货单不选原采购入库行时提交前被拦下，界面显示客户端给出的错误", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await createPostedInbound(master);
  const submitCount = countSubmitRequests(page);

  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("document-type"), "PURCHASE_RETURN");
  await page.getByTestId("document-line-quantity").first().fill("4");
  await page.getByTestId("document-submit").click();

  await expect(page.getByTestId("document-form-error")).toBeVisible();
  await expect(page.getByTestId("document-form-error")).toContainText("缺少原单据行引用");
  expect(submitCount()).toBe(0);
});
