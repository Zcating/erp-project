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
    code: uniqueCode("E2E-RET-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customer = await api("POST", "/api/customers", {
    code: uniqueCode("E2E-RET-CUS"),
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("E2E-RET-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("E2E-RET-SKU"),
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
    itemId: item.payload.data.id as string,
  };
};

const postInbound = async (
  master: Awaited<ReturnType<typeof createMasterData>>,
  quantity: string,
  unitPrice: string,
): Promise<{ id: string; documentNo: string; lineId: string }> => {
  const created = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: master.warehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity, unitPrice, amount: null }],
  });
  expect(created.status).toBe(200);
  const posted = await api("POST", `/api/documents/${created.payload.data.id}/post`);
  expect(posted.status).toBe(200);
  return {
    id: created.payload.data.id as string,
    documentNo: created.payload.data.documentNo as string,
    lineId: created.payload.data.lines[0].id as string,
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

describe("端到端：退货支线（接口断言线）", () => {
  it("销售退货引用原销售出库行过账后账面库存回补，入库成本等于原行已结转成本按数量比例分摊的值", async () => {
    const master = await createMasterData();
    await postInbound(master, "12", "2");
    const outbound = await api("POST", "/api/documents", {
      type: "SALE_OUTBOUND",
      supplierId: null,
      customerId: master.customerId,
      sourceWarehouseId: master.warehouseId,
      targetWarehouseId: null,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "5", unitPrice: "3.5", amount: null }],
    });
    expect(outbound.status).toBe(200);
    const outboundPosted = await api("POST", `/api/documents/${outbound.payload.data.id}/post`);
    expect(outboundPosted.status).toBe(200);
    const outboundLineId = outbound.payload.data.lines[0].id as string;
    const outboundMovements = await movementsOf(outbound.payload.data.documentNo);
    expect(outboundMovements[0]).toMatchObject({
      unitPrice: "2.000000",
      amount: "10.00",
    });

    await postInbound(master, "3", "3");
    expect(await balanceOf(master)).toMatchObject({
      onHand: "10.000",
      unitCost: "2.300000",
    });

    const saleReturn = await api("POST", "/api/documents", {
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
          originalLineId: outboundLineId,
        },
      ],
    });
    expect(saleReturn.status).toBe(200);
    const posted = await api("POST", `/api/documents/${saleReturn.payload.data.id}/post`);
    expect(posted.status).toBe(200);

    expect(await balanceOf(master)).toMatchObject({
      onHand: "12.000",
      available: "12.000",
      inTransit: "0.000",
      unitCost: "2.250000",
    });
    const movements = await movementsOf(saleReturn.payload.data.documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      quantityBefore: "10.000",
      quantityAfter: "12.000",
      unitPrice: "2.000000",
      amount: "4.00",
    });
  });

  it("采购退货引用原采购入库行过账后账面库存按当前加权成本减少", async () => {
    const master = await createMasterData();
    const firstInbound = await postInbound(master, "12", "2");
    await postInbound(master, "12", "4");
    expect(await balanceOf(master)).toMatchObject({
      onHand: "24.000",
      unitCost: "3.000000",
    });

    const purchaseReturn = await api("POST", "/api/documents", {
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
          originalLineId: firstInbound.lineId,
        },
      ],
    });
    expect(purchaseReturn.status).toBe(200);
    const posted = await api("POST", `/api/documents/${purchaseReturn.payload.data.id}/post`);
    expect(posted.status).toBe(200);

    expect(await balanceOf(master)).toMatchObject({
      onHand: "21.000",
      available: "21.000",
      inTransit: "0.000",
      unitCost: "3.000000",
    });
    const movements = await movementsOf(purchaseReturn.payload.data.documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      quantityBefore: "24.000",
      quantityAfter: "21.000",
      unitPrice: "3.000000",
      amount: "9.00",
    });
  });
});
