import {
  expect,
  loginAsAdmin,
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
  supplierCode: string;
  supplierName: string;
  customerCode: string;
  customerName: string;
  warehouseCode: string;
  warehouseName: string;
  itemCode: string;
  itemName: string;
  baseUnit: string;
  auxiliaryUnit: string;
};

const createMasterData = async (): Promise<MasterData> => {
  const supplierCode = uniqueCode("PW-PICK-SUP");
  const customerCode = uniqueCode("PW-PICK-CUS");
  const warehouseCode = uniqueCode("PW-PICK-WH");
  const itemCode = uniqueCode("PW-PICK-SKU");
  const supplierName = "可口可乐（中国）饮料有限公司";
  const customerName = "杭州百货大楼";
  const warehouseName = "杭州总仓";
  const itemName = "可口可乐";
  const baseUnit = "瓶";
  const auxiliaryUnit = "箱";

  await api("POST", "/api/suppliers", {
    code: supplierCode,
    name: supplierName,
    contact: null,
  });
  await api("POST", "/api/customers", {
    code: customerCode,
    name: customerName,
    contact: null,
  });
  await api("POST", "/api/warehouses", {
    code: warehouseCode,
    name: warehouseName,
    purpose: null,
  });
  await api("POST", "/api/items", {
    code: itemCode,
    barcode: null,
    name: itemName,
    specification: null,
    brand: null,
    category: null,
    baseUnit,
    auxiliaryUnits: [{ unit: auxiliaryUnit, conversionRate: "12" }],
  });

  return {
    supplierCode,
    supplierName,
    customerCode,
    customerName,
    warehouseCode,
    warehouseName,
    itemCode,
    itemName,
    baseUnit,
    auxiliaryUnit,
  };
};

test("单据类型下拉触发器在选中后显示中文类型名", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/documents/new");
  await waitForDebugHandles(page);

  await expect(page.getByTestId("document-type")).toHaveText("采购入库单");

  await pickOptionByLabel(page.getByTestId("document-type"), "销售出库单");
  await expect(page.getByTestId("document-type")).toHaveText("销售出库单");

  await pickOptionByLabel(page.getByTestId("document-type"), "盘点单");
  await expect(page.getByTestId("document-type")).toHaveText("盘点单");
});

test("供应商、客户、仓库与商品下拉触发器在选中后显示「编码 名称」", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);

  const supplierLabel = `${master.supplierCode} ${master.supplierName}`;
  await pickOptionByLabel(page.getByTestId("document-type"), "采购入库单");
  await pickOptionByLabel(page.getByTestId("document-supplier"), supplierLabel);
  await expect(page.getByTestId("document-supplier")).toHaveText(supplierLabel);

  const customerLabel = `${master.customerCode} ${master.customerName}`;
  await pickOptionByLabel(page.getByTestId("document-type"), "销售出库单");
  await pickOptionByLabel(page.getByTestId("document-customer"), customerLabel);
  await expect(page.getByTestId("document-customer")).toHaveText(customerLabel);

  const warehouseLabel = `${master.warehouseCode} ${master.warehouseName}`;
  await pickOptionByLabel(page.getByTestId("document-type"), "调拨单");
  await pickOptionByLabel(page.getByTestId("document-source-warehouse"), warehouseLabel);
  await expect(page.getByTestId("document-source-warehouse")).toHaveText(warehouseLabel);

  const itemLabel = `${master.itemCode} ${master.itemName}`;
  await pickOptionByLabel(page.getByTestId("document-line-item").first(), itemLabel);
  await expect(page.getByTestId("document-line-item").first()).toHaveText(itemLabel);
});

test("单位下拉触发器在选中后显示单位本身", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/documents/new");
  await waitForDebugHandles(page);

  await pickOptionByLabel(
    page.getByTestId("document-line-item").first(),
    `${master.itemCode} ${master.itemName}`,
  );
  await expect(page.getByTestId("document-line-unit").first()).toBeEnabled();
  await pickOptionByLabel(page.getByTestId("document-line-unit").first(), master.auxiliaryUnit);
  await expect(page.getByTestId("document-line-unit").first()).toHaveText(master.auxiliaryUnit);
});

test("排序方向下拉触发器在选中后显示「时间正序」与「时间倒序」", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/inventory/movements");
  await waitForDebugHandles(page);

  await expect(page.getByTestId("movement-order-filter")).toHaveText("时间正序");

  await pickOptionByLabel(page.getByTestId("movement-order-filter"), "时间倒序");
  await expect(page.getByTestId("movement-order-filter")).toHaveText("时间倒序");
});

test("候选列表首项是空值项且尚未选中时，触发器显示该空值项文案", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/documents/new");
  await waitForDebugHandles(page);

  await pickOptionByLabel(page.getByTestId("document-type"), "采购入库单");
  const supplierLabels = await pickOptionLabels(page.getByTestId("document-supplier"));
  expect(supplierLabels[0]).toBe("请选择供应商");
  await expect(page.getByTestId("document-supplier")).toHaveText("请选择供应商");

  await pickOptionByLabel(page.getByTestId("document-type"), "销售出库单");
  const customerLabels = await pickOptionLabels(page.getByTestId("document-customer"));
  expect(customerLabels[0]).toBe("请选择客户");
  await expect(page.getByTestId("document-customer")).toHaveText("请选择客户");

  await pickOptionByLabel(page.getByTestId("document-type"), "调拨单");
  const warehouseLabels = await pickOptionLabels(page.getByTestId("document-source-warehouse"));
  expect(warehouseLabels[0]).toBe("请选择仓库");
  await expect(page.getByTestId("document-source-warehouse")).toHaveText("请选择仓库");

  const itemLabels = await pickOptionLabels(page.getByTestId("document-line-item").first());
  expect(itemLabels[0]).toBe("请选择商品");
  await expect(page.getByTestId("document-line-item").first()).toHaveText("请选择商品");
});

test("库存页筛选下拉在未选中时显示空值项文案，仓库只显示仓库名称", async ({ page }) => {
  await loginAsAdmin(page);
  const master = await createMasterData();

  await page.goto("/inventory");
  await waitForDebugHandles(page);

  await expect(page.getByTestId("stock-warehouse-filter")).toHaveText("全部仓库");
  await expect(page.getByTestId("stock-item-filter")).toHaveText("全部商品");

  const warehouseLabels = await pickOptionLabels(page.getByTestId("stock-warehouse-filter"));
  expect(warehouseLabels[0]).toBe("全部仓库");
  expect(warehouseLabels).toContain(master.warehouseName);
  expect(warehouseLabels).not.toContain(`${master.warehouseCode} ${master.warehouseName}`);

  await page.goto("/inventory/movements");
  await waitForDebugHandles(page);

  await expect(page.getByTestId("movement-warehouse-filter")).toHaveText("全部仓库");
  await expect(page.getByTestId("movement-item-filter")).toHaveText("全部商品");
});
