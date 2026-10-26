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

const uniqueBarcode = (): string =>
  `69${Math.floor(Math.random() * 1e11)
    .toString()
    .padStart(11, "0")}`;

type Balance = {
  onHand: string;
  available: string;
  inTransit: string;
  unitCost: string;
};

type Movement = {
  documentNo: string;
  lineNo: number;
  quantityBefore: string;
  quantityAfter: string;
  unitPrice: string;
  amount: string;
};

const balancesOf = async (warehouseId: string, itemId: string): Promise<Balance[]> => {
  const response = await api(
    "GET",
    `/api/inventory/balances?warehouseId=${warehouseId}&itemId=${itemId}`,
  );
  expect(response.status).toBe(200);
  return response.payload.data.balances as Balance[];
};

const movementsOf = async (warehouseId: string, itemId: string): Promise<Movement[]> => {
  const response = await api(
    "GET",
    `/api/inventory/movements?warehouseId=${warehouseId}&itemId=${itemId}`,
  );
  expect(response.status).toBe(200);
  return response.payload.data.movements as Movement[];
};

describe("端到端：全链路主线（接口断言线）", () => {
  it("登录 → 建商品（条码与 1 箱 = 12 瓶换算）→ 建供应商 → 采购入库 1 箱过账 → 销售出库 5 瓶过账 → 账面 7、可用 7、在途 0，库存流水两笔（入库 +12、出库 -5 带结转成本 10.00）", async () => {
    const session = await api("GET", "/api/session");
    expect(session.status).toBe(200);
    expect(session.payload.data.adminId).toBe(defaultAdminUsername);

    const item = await api("POST", "/api/items", {
      code: uniqueCode("E2E-FULL-SKU"),
      barcode: uniqueBarcode(),
      name: "可口可乐",
      specification: "500ml/瓶",
      brand: "可口可乐",
      category: "饮料",
      baseUnit: "瓶",
      auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
    });
    expect(item.status).toBe(200);
    expect(item.payload.data.barcode).not.toBeNull();
    expect(item.payload.data.auxiliaryUnits).toEqual([{ unit: "箱", conversionRate: "12.000000" }]);
    const itemId = item.payload.data.id as string;

    const supplier = await api("POST", "/api/suppliers", {
      code: uniqueCode("E2E-FULL-SUP"),
      name: "可口可乐（中国）饮料有限公司",
      contact: null,
    });
    expect(supplier.status).toBe(200);
    const supplierId = supplier.payload.data.id as string;

    const customer = await api("POST", "/api/customers", {
      code: uniqueCode("E2E-FULL-CUS"),
      name: "杭州百货大楼",
      contact: null,
    });
    expect(customer.status).toBe(200);
    const customerId = customer.payload.data.id as string;

    const warehouse = await api("POST", "/api/warehouses", {
      code: uniqueCode("E2E-FULL-WH"),
      name: "杭州总仓",
      purpose: null,
    });
    expect(warehouse.status).toBe(200);
    const warehouseId = warehouse.payload.data.id as string;

    const inbound = await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: warehouseId,
      warehouseId: null,
      lines: [{ itemId, quantity: "1", unit: "箱", unitPrice: "2", amount: null }],
    });
    expect(inbound.status).toBe(200);
    expect(inbound.payload.data.status).toBe("DRAFT");
    expect(inbound.payload.data.lines[0].quantity).toBe("12.000");
    expect(inbound.payload.data.lines[0].amount).toBe("24.00");
    const inboundNo = inbound.payload.data.documentNo as string;

    const inboundPosted = await api("POST", `/api/documents/${inbound.payload.data.id}/post`);
    expect(inboundPosted.status).toBe(200);
    expect(inboundPosted.payload.data.status).toBe("POSTED");

    const outbound = await api("POST", "/api/documents", {
      type: "SALE_OUTBOUND",
      supplierId: null,
      customerId,
      sourceWarehouseId: warehouseId,
      targetWarehouseId: null,
      warehouseId: null,
      lines: [{ itemId, quantity: "5", unitPrice: "3.5", amount: null }],
    });
    expect(outbound.status).toBe(200);
    expect(outbound.payload.data.lines[0].quantity).toBe("5.000");
    expect(outbound.payload.data.lines[0].amount).toBe("17.50");
    const outboundNo = outbound.payload.data.documentNo as string;

    const outboundPosted = await api("POST", `/api/documents/${outbound.payload.data.id}/post`);
    expect(outboundPosted.status).toBe(200);
    expect(outboundPosted.payload.data.status).toBe("POSTED");

    const balances = await balancesOf(warehouseId, itemId);
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({
      onHand: "7.000",
      available: "7.000",
      inTransit: "0.000",
      unitCost: "2.000000",
    });

    const movements = await movementsOf(warehouseId, itemId);
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      documentNo: inboundNo,
      lineNo: 1,
      quantityBefore: "0.000",
      quantityAfter: "12.000",
      unitPrice: "2.000000",
      amount: "24.00",
    });
    expect(movements[1]).toMatchObject({
      documentNo: outboundNo,
      lineNo: 1,
      quantityBefore: "12.000",
      quantityAfter: "7.000",
      unitPrice: "2.000000",
      amount: "10.00",
    });
  });
});
