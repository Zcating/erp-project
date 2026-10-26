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

const uniqueBarcode = (): string =>
  `69${Math.floor(Math.random() * 1e11)
    .toString()
    .padStart(11, "0")}`;

type MasterData = {
  supplierId: string;
  customerId: string;
  warehouseId: string;
  itemId: string;
};

const createPartiesViaApi = async (): Promise<Omit<MasterData, "itemId">> => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("PW-FULL-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customer = await api("POST", "/api/customers", {
    code: uniqueCode("PW-FULL-CUS"),
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-FULL-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  return {
    supplierId: supplier.payload.data.id as string,
    customerId: customer.payload.data.id as string,
    warehouseId: warehouse.payload.data.id as string,
  };
};

const documentNumbersOf = async (type: string): Promise<Set<string>> => {
  const response = await api("GET", `/api/documents?type=${type}`);
  const documents = response.payload.data.documents as Array<{ documentNo: string }>;
  return new Set(documents.map((document) => document.documentNo));
};

const newDocumentNo = async (type: string, before: Set<string>): Promise<string> => {
  const after = await documentNumbersOf(type);
  const created = [...after].filter((documentNo) => !before.has(documentNo));
  expect(created).toHaveLength(1);
  return created[0] as string;
};

const rowOf = (page: Page, documentNo: string) =>
  page.getByTestId("document-row").filter({ hasText: documentNo });

test("主线：登录 → 建商品（条码与 1 箱 = 12 瓶换算）→ 建供应商 → 采购入库 1 箱过账 → 销售出库 5 瓶过账 → 库存页账面 7、可用 7、在途 0 → 库存流水页两笔（入库 +12、出库 -5 带结转成本 10.00）", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await expect(page.getByTestId("admin-nav")).toBeVisible();

  const itemCode = uniqueCode("PW-FULL-SKU");
  const barcode = uniqueBarcode();
  await page.goto("/items/new");
  await waitForDebugHandles(page);
  await page.getByTestId("item-code").fill(itemCode);
  await page.getByTestId("item-barcode").fill(barcode);
  await page.getByTestId("item-name").fill("可口可乐");
  await page.getByTestId("item-specification").fill("500ml/瓶");
  await page.getByTestId("item-brand").fill("可口可乐");
  await page.getByTestId("item-category").fill("饮料");
  await page.getByTestId("item-base-unit").fill("瓶");
  await page.getByTestId("item-aux-add").click();
  await page.getByTestId("item-aux-unit").nth(0).fill("箱");
  await page.getByTestId("item-aux-rate").nth(0).fill("12");
  await page.getByTestId("item-submit").click();
  await expect(page).toHaveURL(/\/items$/);
  const itemRow = page.getByTestId("item-row").filter({ hasText: itemCode });
  await expect(itemRow.getByTestId("item-barcode")).toHaveText(barcode);
  await expect(itemRow.getByTestId("item-auxiliary-units")).toContainText("箱 × 12");

  const item = await api("GET", `/api/items/by-barcode/${barcode}`);
  expect(item.status).toBe(200);
  const master: MasterData = {
    ...(await createPartiesViaApi()),
    itemId: item.payload.data.id as string,
  };

  const beforeInbound = await documentNumbersOf("PURCHASE_INBOUND");
  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("PURCHASE_INBOUND");
  await page.getByTestId("document-supplier").selectOption(master.supplierId);
  await page.getByTestId("document-target-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-line-item").first().selectOption(master.itemId);
  await page.getByTestId("document-line-unit").first().selectOption("箱");
  await page.getByTestId("document-line-quantity").first().fill("1");
  await page.getByTestId("document-line-unit-price").first().fill("2");
  await expect(page.getByTestId("document-line-amount").first()).toHaveText("24.00");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const inboundNo = await newDocumentNo("PURCHASE_INBOUND", beforeInbound);
  const inboundRow = rowOf(page, inboundNo);
  await expect(inboundRow.getByTestId("document-type")).toHaveText("采购入库单");
  await expect(inboundRow.getByTestId("document-amounts")).toHaveText("24.00");
  await inboundRow.getByTestId("document-post").click();
  await expect(inboundRow.getByTestId("posting-confirm")).toBeVisible();
  await inboundRow.getByTestId("posting-confirm-accept").click();
  await expect(inboundRow.getByTestId("document-status")).toHaveText("已过账");

  const beforeOutbound = await documentNumbersOf("SALE_OUTBOUND");
  await page.goto("/documents/new");
  await waitForDebugHandles(page);
  await page.getByTestId("document-type").selectOption("SALE_OUTBOUND");
  await page.getByTestId("document-customer").selectOption(master.customerId);
  await page.getByTestId("document-source-warehouse").selectOption(master.warehouseId);
  await page.getByTestId("document-line-item").first().selectOption(master.itemId);
  await page.getByTestId("document-line-quantity").first().fill("5");
  await page.getByTestId("document-line-unit-price").first().fill("3.5");
  await expect(page.getByTestId("document-line-amount").first()).toHaveText("17.50");
  await page.getByTestId("document-submit").click();
  await expect(page).toHaveURL(/\/documents$/);

  const outboundNo = await newDocumentNo("SALE_OUTBOUND", beforeOutbound);
  const outboundRow = rowOf(page, outboundNo);
  await expect(outboundRow.getByTestId("document-type")).toHaveText("销售出库单");
  await expect(outboundRow.getByTestId("document-amounts")).toHaveText("17.50");
  await outboundRow.getByTestId("document-post").click();
  await expect(outboundRow.getByTestId("posting-confirm")).toBeVisible();
  await outboundRow.getByTestId("posting-confirm-accept").click();
  await expect(outboundRow.getByTestId("document-status")).toHaveText("已过账");

  await page.goto("/inventory");
  await waitForDebugHandles(page);
  await page.getByTestId("stock-warehouse-filter").selectOption(master.warehouseId);
  await page.getByTestId("stock-item-filter").selectOption(master.itemId);
  const stockRow = page.getByTestId("stock-row");
  await expect(stockRow).toHaveCount(1);
  await expect(stockRow.first().getByTestId("stock-on-hand")).toHaveText("7.000");
  await expect(stockRow.first().getByTestId("stock-available")).toHaveText("7.000");
  await expect(stockRow.first().getByTestId("stock-in-transit")).toHaveText("0.000");
  await expect(stockRow.first().getByTestId("stock-unit-cost")).toHaveText("2.000000");

  await page.goto("/inventory/movements");
  await waitForDebugHandles(page);
  await page.getByTestId("movement-warehouse-filter").selectOption(master.warehouseId);
  await page.getByTestId("movement-item-filter").selectOption(master.itemId);
  const movementRows = page.getByTestId("movement-row");
  await expect(movementRows).toHaveCount(2);

  const inboundMovement = movementRows.filter({ hasText: inboundNo });
  await expect(inboundMovement.getByTestId("movement-document-no")).toHaveText(inboundNo);
  await expect(inboundMovement.getByTestId("movement-line-no")).toHaveText("1");
  await expect(inboundMovement.getByTestId("movement-quantity-before")).toHaveText("0.000");
  await expect(inboundMovement.getByTestId("movement-quantity-after")).toHaveText("12.000");
  await expect(inboundMovement.getByTestId("movement-unit-price")).toHaveText("2.000000");
  await expect(inboundMovement.getByTestId("movement-amount")).toHaveText("24.00");

  const outboundMovement = movementRows.filter({ hasText: outboundNo });
  await expect(outboundMovement.getByTestId("movement-document-no")).toHaveText(outboundNo);
  await expect(outboundMovement.getByTestId("movement-line-no")).toHaveText("1");
  await expect(outboundMovement.getByTestId("movement-quantity-before")).toHaveText("12.000");
  await expect(outboundMovement.getByTestId("movement-quantity-after")).toHaveText("7.000");
  await expect(outboundMovement.getByTestId("movement-unit-price")).toHaveText("2.000000");
  await expect(outboundMovement.getByTestId("movement-amount")).toHaveText("10.00");
});
