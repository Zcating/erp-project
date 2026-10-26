import { describe, expect, it } from "vitest";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const defaultAdminUsername = "admin";
const defaultAdminPassword = "admin-dev-password";

let cachedCookie: string | null = null;

async function sessionCookie(): Promise<string> {
  if (cachedCookie !== null) {
    return cachedCookie;
  }
  const response = await fetch(`${apiBaseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: defaultAdminUsername, password: defaultAdminPassword }),
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
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text === "" ? undefined : JSON.parse(text),
  };
}

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

type Balance = {
  onHand: string;
  available: string;
  inTransit: string;
  unitCost: string;
};

type Movement = {
  documentNo: string;
  quantityBefore: string;
  quantityAfter: string;
  unitPrice: string;
  amount: string;
};

const createMasterData = async () => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("E2E-STK-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("E2E-STK-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("E2E-STK-SKU"),
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

const seedStock = async (master: Awaited<ReturnType<typeof createMasterData>>): Promise<void> => {
  const inbound = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: master.warehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity: "12", unitPrice: "2", amount: null }],
  });
  expect(inbound.status).toBe(200);
  const posted = await api("POST", `/api/documents/${inbound.payload.data.id}/post`);
  expect(posted.status).toBe(200);
};

const createStocktake = async (
  master: Awaited<ReturnType<typeof createMasterData>>,
  countedQuantity: string,
): Promise<{ id: string; documentNo: string }> => {
  const created = await api("POST", "/api/documents", {
    type: "STOCKTAKE",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: null,
    warehouseId: master.warehouseId,
    lines: [{ itemId: master.itemId, quantity: countedQuantity, unitPrice: null, amount: null }],
  });
  expect(created.status).toBe(200);
  return {
    id: created.payload.data.id as string,
    documentNo: created.payload.data.documentNo as string,
  };
};

const balanceOf = async (
  master: Awaited<ReturnType<typeof createMasterData>>,
): Promise<Balance> => {
  const response = await api(
    "GET",
    `/api/inventory/balances?warehouseId=${master.warehouseId}&itemId=${master.itemId}`,
  );
  expect(response.status).toBe(200);
  const balances = response.payload.data.balances as Balance[];
  expect(balances).toHaveLength(1);
  return balances[0] as Balance;
};

const movementsOf = async (documentNo: string): Promise<Movement[]> => {
  const response = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  expect(response.status).toBe(200);
  return response.payload.data.movements as Movement[];
};

const stocktakeDocumentNumbers = async (): Promise<string[]> => {
  const response = await api("GET", "/api/documents?type=STOCKTAKE");
  const documents = response.payload.data.documents as Array<{ documentNo: string }>;
  return documents.map((document) => document.documentNo).sort();
};

describe("端到端：盘点支线（接口断言线）", () => {
  it("盘盈过账后账面库存与实盘数量一致，成本按当前加权成本结转", async () => {
    const master = await createMasterData();
    await seedStock(master);
    const stocktake = await createStocktake(master, "15");

    const posted = await api("POST", `/api/documents/${stocktake.id}/post`);
    expect(posted.status).toBe(200);

    expect(await balanceOf(master)).toMatchObject({
      onHand: "15.000",
      available: "15.000",
      inTransit: "0.000",
      unitCost: "2.000000",
    });
    const movements = await movementsOf(stocktake.documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      quantityBefore: "12.000",
      quantityAfter: "15.000",
      unitPrice: "2.000000",
      amount: "6.00",
    });
  });

  it("盘亏过账后账面库存与实盘数量一致，流水记录调减前后的数量", async () => {
    const master = await createMasterData();
    await seedStock(master);
    const stocktake = await createStocktake(master, "9");

    const posted = await api("POST", `/api/documents/${stocktake.id}/post`);
    expect(posted.status).toBe(200);

    expect(await balanceOf(master)).toMatchObject({
      onHand: "9.000",
      available: "9.000",
      inTransit: "0.000",
      unitCost: "2.000000",
    });
    const movements = await movementsOf(stocktake.documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      quantityBefore: "12.000",
      quantityAfter: "9.000",
      unitPrice: "2.000000",
      amount: "6.00",
    });
  });

  it("实盘数量为负数的盘点单在草稿阶段就被拒绝，库存与库存流水都不发生变化", async () => {
    const master = await createMasterData();
    await seedStock(master);
    const before = await stocktakeDocumentNumbers();

    const rejected = await api("POST", "/api/documents", {
      type: "STOCKTAKE",
      supplierId: null,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: null,
      warehouseId: master.warehouseId,
      lines: [{ itemId: master.itemId, quantity: "-1", unitPrice: null, amount: null }],
    });

    expect(rejected.status).toBe(400);
    expect(rejected.payload.error.message).toContain("实盘数量不能为负数");
    expect(await balanceOf(master)).toMatchObject({ onHand: "12.000" });
    expect(await stocktakeDocumentNumbers()).toEqual(before);
  });

  it("同一张盘点单内同一商品重复出现时保存失败，账面库存不变", async () => {
    const master = await createMasterData();
    await seedStock(master);

    const rejected = await api("POST", "/api/documents", {
      type: "STOCKTAKE",
      supplierId: null,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: null,
      warehouseId: master.warehouseId,
      lines: [
        { itemId: master.itemId, quantity: "9", unitPrice: null, amount: null },
        { itemId: master.itemId, quantity: "8", unitPrice: null, amount: null },
      ],
    });

    expect(rejected.status).toBe(400);
    expect(rejected.payload.error.message).toContain("同一商品不能重复出现");
    expect(await balanceOf(master)).toMatchObject({ onHand: "12.000" });
  });
});
