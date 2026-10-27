import type { Locator, Page } from "@playwright/test";
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

type PostAction = {
  phase: string | null;
  label: string;
  enabled: boolean;
  reason: string | null;
};

type DocumentActions = {
  post: PostAction[];
  void: { label: string; enabled: boolean; reason: string | null };
};

type DocumentView = {
  id: string;
  documentNo: string;
  actions: DocumentActions;
};

const postTestIdOf = (phase: string | null): string =>
  phase === null ? "document-post" : `document-post-${phase.toLowerCase()}`;

const rowOf = (page: Page, documentNo: string): Locator =>
  page.getByTestId("document-row").filter({ hasText: documentNo });

const actionsOf = async (documentId: string): Promise<DocumentActions> => {
  const response = await api("GET", `/api/documents/${documentId}`);
  expect(response.status).toBe(200);
  return (response.payload.data as DocumentView).actions;
};

const expectButtonsFollowServer = async (row: Locator, actions: DocumentActions): Promise<void> => {
  for (const action of actions.post) {
    const button = row.getByTestId(postTestIdOf(action.phase));
    await expect(button).toHaveText(action.label);
    if (action.enabled) {
      await expect(button).toBeEnabled();
    } else {
      await expect(button).toBeDisabled();
    }
  }
  const voidButton = row.getByTestId("document-void");
  await expect(voidButton).toHaveText(actions.void.label);
  if (actions.void.enabled) {
    await expect(voidButton).toBeEnabled();
  } else {
    await expect(voidButton).toBeDisabled();
  }
};

const openTransferList = async (page: Page): Promise<void> => {
  await page.goto("/documents");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("document-type-filter"), "TRANSFER");
};

test("过账与作废按钮的可用性跟随服务端下发的可用动作", async ({ page }) => {
  await loginAsAdmin(page);
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("PW-ACT-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const source = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-ACT-WH-SRC"),
    name: "杭州总仓",
    purpose: null,
  });
  const target = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-ACT-WH-TGT"),
    name: "杭州分仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("PW-ACT-SKU"),
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  });
  const created = await api("POST", "/api/documents", {
    type: "TRANSFER",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: source.payload.data.id,
    targetWarehouseId: target.payload.data.id,
    warehouseId: null,
    lines: [{ itemId: item.payload.data.id, quantity: "4", unitPrice: "2", amount: null }],
  });
  expect(created.status).toBe(200);
  const documentId = created.payload.data.id as string;
  const documentNo = created.payload.data.documentNo as string;

  const inbound = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: supplier.payload.data.id,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: source.payload.data.id,
    warehouseId: null,
    lines: [{ itemId: item.payload.data.id, quantity: "10", unitPrice: "2", amount: null }],
  });
  expect(inbound.status).toBe(200);
  const inboundPosted = await api("POST", `/api/documents/${inbound.payload.data.id}/post`);
  expect(inboundPosted.status).toBe(200);

  await openTransferList(page);
  const row = rowOf(page, documentNo);
  await expectButtonsFollowServer(row, await actionsOf(documentId));

  const posted = await api("POST", `/api/documents/${documentId}/post`, { phase: "OUT" });
  expect(posted.status).toBe(200);

  await openTransferList(page);
  await expectButtonsFollowServer(rowOf(page, documentNo), await actionsOf(documentId));
});
