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

type MasterData = {
  supplierId: string;
  customerId: string;
  warehouseId: string;
  otherWarehouseId: string;
  itemId: string;
};

const createMasterData = async (): Promise<MasterData> => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("PW-ACT-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customer = await api("POST", "/api/customers", {
    code: uniqueCode("PW-ACT-CUS"),
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-ACT-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  const otherWarehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("PW-ACT-WH2"),
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
  return {
    supplierId: supplier.payload.data.id as string,
    customerId: customer.payload.data.id as string,
    warehouseId: warehouse.payload.data.id as string,
    otherWarehouseId: otherWarehouse.payload.data.id as string,
    itemId: item.payload.data.id as string,
  };
};

const postInbound = async (
  master: MasterData,
  quantity: string,
): Promise<{ documentNo: string; lineId: string }> => {
  const created = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: master.warehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity, unitPrice: "2", amount: null }],
  });
  expect(created.status).toBe(200);
  const posted = await api("POST", `/api/documents/${created.payload.data.id}/post`);
  expect(posted.status).toBe(200);
  return {
    documentNo: created.payload.data.documentNo as string,
    lineId: created.payload.data.lines[0].id as string,
  };
};

const postOutbound = async (
  master: MasterData,
  quantity: string,
): Promise<{ documentNo: string; lineId: string }> => {
  const created = await api("POST", "/api/documents", {
    type: "SALE_OUTBOUND",
    supplierId: null,
    customerId: master.customerId,
    sourceWarehouseId: master.warehouseId,
    targetWarehouseId: null,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity, unitPrice: "3.5", amount: null }],
  });
  expect(created.status).toBe(200);
  const posted = await api("POST", `/api/documents/${created.payload.data.id}/post`);
  expect(posted.status).toBe(200);
  return {
    documentNo: created.payload.data.documentNo as string,
    lineId: created.payload.data.lines[0].id as string,
  };
};

const balanceOf = async (
  master: MasterData,
  warehouseId: string,
): Promise<{ onHand: string; inTransit: string } | undefined> => {
  const response = await api(
    "GET",
    `/api/inventory/balances?warehouseId=${warehouseId}&itemId=${master.itemId}`,
  );
  const balances = response.payload.data.balances as Array<{
    onHand: string;
    inTransit: string;
  }>;
  return balances[0];
};

const movementsOf = async (documentNo: string): Promise<unknown[]> => {
  const response = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  return response.payload.data.movements as unknown[];
};

const statusOf = async (documentNo: string): Promise<string> => {
  const response = await api("GET", "/api/documents");
  const documents = response.payload.data.documents as Array<{
    documentNo: string;
    status: string;
  }>;
  return documents.find((document) => document.documentNo === documentNo)?.status ?? "";
};

const rowOf = (page: Page, documentNo: string): Locator =>
  page.getByTestId("document-row").filter({ hasText: documentNo });

const openListOfType = async (page: Page, type: string): Promise<void> => {
  await page.goto("/documents");
  await waitForDebugHandles(page);
  await pickOption(page.getByTestId("document-type-filter"), type);
};

const expectDraftButtons = async (row: Locator): Promise<void> => {
  await expect(row.getByTestId("document-post")).toBeEnabled();
  await expect(row.getByTestId("document-void")).toBeDisabled();
};

const expectPostedButtons = async (row: Locator): Promise<void> => {
  await expect(row.getByTestId("document-post")).toBeDisabled();
  await expect(row.getByTestId("document-void")).toBeEnabled();
};

const expectVoidedButtons = async (row: Locator): Promise<void> => {
  await expect(row.getByTestId("document-post")).toBeDisabled();
  await expect(row.getByTestId("document-void")).toBeDisabled();
};

test("销售退货单草稿经接口创建，列表页按类型可见，过账与作废按钮的三态与二次确认都成立", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postInbound(master, "12");
  const outbound = await postOutbound(master, "5");
  const created = await api("POST", "/api/documents", {
    type: "SALE_RETURN",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: null,
    lines: [
      {
        itemId: master.itemId,
        quantity: "2",
        unitPrice: null,
        amount: null,
        originalLineId: outbound.lineId,
      },
    ],
  });
  expect(created.status).toBe(200);
  const documentNo = created.payload.data.documentNo as string;

  await openListOfType(page, "SALE_RETURN");
  const row = rowOf(page, documentNo);
  await expect(row.getByTestId("document-type")).toHaveText("销售退货单");
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
  await expectDraftButtons(row);

  await row.getByTestId("document-post").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-cancel").click();
  await expect(row.getByTestId("posting-confirm")).toHaveCount(0);
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
  expect(await statusOf(documentNo)).toBe("DRAFT");
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("7.000");
  expect(await movementsOf(documentNo)).toEqual([]);

  await row.getByTestId("document-post").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  await expectPostedButtons(row);
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("9.000");

  await row.getByTestId("document-void").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-cancel").click();
  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("9.000");

  await row.getByTestId("document-void").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-status")).toHaveText("已作废");
  await expectVoidedButtons(row);
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("7.000");
});

test("采购退货单草稿经接口创建，列表页按类型可见，过账与作废按钮的三态与二次确认都成立", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  const inbound = await postInbound(master, "12");
  const created = await api("POST", "/api/documents", {
    type: "PURCHASE_RETURN",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: null,
    lines: [
      {
        itemId: master.itemId,
        quantity: "3",
        unitPrice: null,
        amount: null,
        originalLineId: inbound.lineId,
      },
    ],
  });
  expect(created.status).toBe(200);
  const documentNo = created.payload.data.documentNo as string;

  await openListOfType(page, "PURCHASE_RETURN");
  const row = rowOf(page, documentNo);
  await expect(row.getByTestId("document-type")).toHaveText("采购退货单");
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
  await expectDraftButtons(row);

  await row.getByTestId("document-post").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-cancel").click();
  await expect(row.getByTestId("posting-confirm")).toHaveCount(0);
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
  expect(await statusOf(documentNo)).toBe("DRAFT");
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("12.000");
  expect(await movementsOf(documentNo)).toEqual([]);

  await row.getByTestId("document-post").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  await expectPostedButtons(row);
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("9.000");

  await row.getByTestId("document-void").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-cancel").click();
  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("9.000");

  await row.getByTestId("document-void").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-status")).toHaveText("已作废");
  await expectVoidedButtons(row);
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("12.000");
});

test("盘点单草稿经接口创建，列表页按类型可见，过账与作废按钮的三态与二次确认都成立", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postInbound(master, "12");
  const created = await api("POST", "/api/documents", {
    type: "STOCKTAKE",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: master.warehouseId,
    lines: [{ itemId: master.itemId, quantity: "9", unitPrice: null, amount: null }],
  });
  expect(created.status).toBe(200);
  const documentNo = created.payload.data.documentNo as string;

  await openListOfType(page, "STOCKTAKE");
  const row = rowOf(page, documentNo);
  await expect(row.getByTestId("document-type")).toHaveText("盘点单");
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
  await expectDraftButtons(row);

  await row.getByTestId("document-post").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-cancel").click();
  await expect(row.getByTestId("posting-confirm")).toHaveCount(0);
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
  expect(await statusOf(documentNo)).toBe("DRAFT");
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("12.000");
  expect(await movementsOf(documentNo)).toEqual([]);

  await row.getByTestId("document-post").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  await expectPostedButtons(row);
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("9.000");

  await row.getByTestId("document-void").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-cancel").click();
  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("9.000");

  await row.getByTestId("document-void").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-status")).toHaveText("已作废");
  await expectVoidedButtons(row);
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("12.000");
});

test("调拨单草稿经接口创建，列表页按类型可见，调出与调入两个过账按钮和作废按钮的三态都成立", async ({
  page,
}) => {
  await loginAsAdmin(page);
  const master = await createMasterData();
  await postInbound(master, "12");
  const created = await api("POST", "/api/documents", {
    type: "TRANSFER",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: master.warehouseId,
    targetWarehouseId: master.otherWarehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity: "4", unitPrice: "2", amount: null }],
  });
  expect(created.status).toBe(200);
  const documentNo = created.payload.data.documentNo as string;

  await openListOfType(page, "TRANSFER");
  const row = rowOf(page, documentNo);
  await expect(row.getByTestId("document-type")).toHaveText("调拨单");
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
  await expect(row.getByTestId("document-post-out")).toBeEnabled();
  await expect(row.getByTestId("document-post-in")).toBeDisabled();
  await expect(row.getByTestId("document-void")).toBeDisabled();

  await row.getByTestId("document-post-out").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-cancel").click();
  await expect(row.getByTestId("posting-confirm")).toHaveCount(0);
  await expect(row.getByTestId("document-status")).toHaveText("草稿");
  expect(await statusOf(documentNo)).toBe("DRAFT");
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("12.000");
  expect((await balanceOf(master, master.warehouseId))?.inTransit).toBe("0.000");
  expect(await movementsOf(documentNo)).toEqual([]);

  await row.getByTestId("document-post-out").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-status")).toHaveText("已过账");
  await expect(row.getByTestId("document-post-out")).toBeDisabled();
  await expect(row.getByTestId("document-post-in")).toBeEnabled();
  await expect(row.getByTestId("document-void")).toBeEnabled();
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("8.000");
  expect((await balanceOf(master, master.warehouseId))?.inTransit).toBe("4.000");

  await row.getByTestId("document-post-in").click();
  await expect(row.getByTestId("posting-confirm")).toBeVisible();
  await row.getByTestId("posting-cancel").click();
  await expect(row.getByTestId("posting-confirm")).toHaveCount(0);
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("8.000");
  expect((await balanceOf(master, master.warehouseId))?.inTransit).toBe("4.000");

  await row.getByTestId("document-post-in").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-post-out")).toBeDisabled();
  await expect(row.getByTestId("document-post-in")).toBeDisabled();
  await expect(row.getByTestId("document-void")).toBeEnabled();
  expect((await balanceOf(master, master.otherWarehouseId))?.onHand).toBe("4.000");

  await row.getByTestId("document-void").click();
  await row.getByTestId("posting-confirm-accept").click();
  await expect(row.getByTestId("document-status")).toHaveText("已作废");
  await expect(row.getByTestId("document-post-out")).toBeDisabled();
  await expect(row.getByTestId("document-post-in")).toBeDisabled();
  await expect(row.getByTestId("document-void")).toBeDisabled();
  expect((await balanceOf(master, master.warehouseId))?.onHand).toBe("12.000");
  expect((await balanceOf(master, master.otherWarehouseId))?.onHand).toBe("0.000");
});
