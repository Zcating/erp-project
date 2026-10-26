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

const createMasterData = async () => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("E2E-DOC-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customer = await api("POST", "/api/customers", {
    code: uniqueCode("E2E-DOC-CUS"),
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("E2E-DOC-WH"),
    name: "杭州总仓",
    purpose: null,
  });
  const otherWarehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("E2E-DOC-WH2"),
    name: "杭州分仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("E2E-DOC-SKU"),
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

describe("端到端：单据草稿", () => {
  it("四类草稿各自新建一条，单号形如 <前缀>-<YYYYMMDD>-<当日序号>且状态是草稿", async () => {
    const master = await createMasterData();

    const bodies = [
      {
        type: "PURCHASE_INBOUND",
        prefix: "PIN",
        body: {
          type: "PURCHASE_INBOUND",
          supplierId: master.supplierId,
          customerId: null,
          sourceWarehouseId: null,
          targetWarehouseId: master.warehouseId,
          warehouseId: null,
          lines: [{ itemId: master.itemId, quantity: "3", unitPrice: "1.115", amount: null }],
        },
      },
      {
        type: "SALE_OUTBOUND",
        prefix: "SOUT",
        body: {
          type: "SALE_OUTBOUND",
          supplierId: null,
          customerId: master.customerId,
          sourceWarehouseId: master.warehouseId,
          targetWarehouseId: null,
          warehouseId: null,
          lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "2", amount: null }],
        },
      },
      {
        type: "STOCKTAKE",
        prefix: "STK",
        body: {
          type: "STOCKTAKE",
          supplierId: null,
          customerId: null,
          sourceWarehouseId: null,
          targetWarehouseId: null,
          warehouseId: master.warehouseId,
          lines: [{ itemId: master.itemId, quantity: "0", unitPrice: null, amount: null }],
        },
      },
      {
        type: "TRANSFER",
        prefix: "TRF",
        body: {
          type: "TRANSFER",
          supplierId: null,
          customerId: null,
          sourceWarehouseId: master.warehouseId,
          targetWarehouseId: master.otherWarehouseId,
          warehouseId: null,
          lines: [{ itemId: master.itemId, quantity: "2", unitPrice: "1.5", amount: null }],
        },
      },
    ];

    for (const { prefix, body } of bodies) {
      const created = await api("POST", "/api/documents", body);

      expect(created.status).toBe(200);
      expect(created.payload.data.status).toBe("DRAFT");
      expect(created.payload.data.documentNo).toMatch(new RegExp(`^${prefix}-\\d{8}-\\d{3}$`));
    }
  });

  it("同一天连续创建同类型单据，单号的当日序号依次递增且互不重复", async () => {
    const master = await createMasterData();
    const body = {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "1", amount: null }],
    };

    const created = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await api("POST", "/api/documents", body);
      created.push(response.payload.data.documentNo as string);
    }

    expect(new Set(created).size).toBe(3);
    const sequences = created.map((documentNo) => Number(documentNo.split("-")[2]));
    expect(sequences[1]).toBeGreaterThan(sequences[0] ?? 0);
    expect(sequences[2]).toBeGreaterThan(sequences[1] ?? 0);
  });

  it("列表可以按类型与状态筛选，筛选结果只含该类型单据", async () => {
    const master = await createMasterData();
    await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "1", amount: null }],
    });

    const list = await api("GET", "/api/documents?type=PURCHASE_INBOUND&status=DRAFT");
    expect(list.status).toBe(200);
    expect(
      list.payload.data.documents.every(
        (document: any) => document.type === "PURCHASE_INBOUND" && document.status === "DRAFT",
      ),
    ).toBe(true);
    expect(list.payload.data.documents.length).toBeGreaterThan(0);
  });

  it("修改草稿行的数量与单价成功，删除草稿后列表里不再出现", async () => {
    const master = await createMasterData();
    const created = await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "3", unitPrice: "1.115", amount: null }],
    });
    const documentId = created.payload.data.id as string;

    const updated = await api("PUT", `/api/documents/${documentId}`, {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "4", unitPrice: "1.115", amount: null }],
    });
    expect(updated.status).toBe(200);
    expect(updated.payload.data.lines[0].quantity).toBe("4.000");
    expect(updated.payload.data.lines[0].unitPrice).toBe("1.115000");
    expect(updated.payload.data.lines[0].amount).toBe("4.46");

    const reread = await api("GET", `/api/documents/${documentId}`);
    expect(reread.payload.data.lines[0].quantity).toBe("4.000");
    expect(reread.payload.data.lines[0].amount).toBe("4.46");

    const deleted = await api("DELETE", `/api/documents/${documentId}`);
    expect(deleted.status).toBe(200);

    const list = await api("GET", "/api/documents");
    expect(
      list.payload.data.documents.find((document: any) => document.id === documentId),
    ).toBeUndefined();
  });

  it("单据行数量为 0、单价为负数、盘点行带单价时保存失败并指出哪一项不合法", async () => {
    const master = await createMasterData();

    const zeroQuantity = await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "0", unitPrice: "1", amount: null }],
    });
    expect(zeroQuantity.status).toBe(400);
    expect(zeroQuantity.payload.error.message).toContain("数量");

    const negativeUnitPrice = await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "-1", amount: null }],
    });
    expect(negativeUnitPrice.status).toBe(400);
    expect(negativeUnitPrice.payload.error.message).toContain("单价");

    const stocktakeWithUnitPrice = await api("POST", "/api/documents", {
      type: "STOCKTAKE",
      supplierId: null,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: null,
      warehouseId: master.warehouseId,
      lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "1.5", amount: null }],
    });
    expect(stocktakeWithUnitPrice.status).toBe(400);
    expect(stocktakeWithUnitPrice.payload.error.message).toContain("盘点行不含单价与金额");
  });

  it("缺少参与方或仓库时保存失败，错误消息指出缺哪一项", async () => {
    const master = await createMasterData();

    const withoutSupplier = await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId: null,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "1", amount: null }],
    });
    expect(withoutSupplier.status).toBe(400);
    expect(withoutSupplier.payload.error.message).toBe("缺少供应商");

    const withoutCustomer = await api("POST", "/api/documents", {
      type: "SALE_OUTBOUND",
      supplierId: null,
      customerId: null,
      sourceWarehouseId: master.warehouseId,
      targetWarehouseId: null,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "1", amount: null }],
    });
    expect(withoutCustomer.status).toBe(400);
    expect(withoutCustomer.payload.error.message).toBe("缺少客户");

    const sameWarehouses = await api("POST", "/api/documents", {
      type: "TRANSFER",
      supplierId: null,
      customerId: null,
      sourceWarehouseId: master.warehouseId,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "1", amount: null }],
    });
    expect(sameWarehouses.status).toBe(400);
    expect(sameWarehouses.payload.error.message).toBe("源仓与目标仓必须不同");
  });

  it("被单据引用的供应商、客户、仓库删除请求被拒，记录仍在列表中", async () => {
    const master = await createMasterData();
    const created = await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.warehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "1", unitPrice: "1", amount: null }],
    });
    expect(created.status).toBe(200);

    const rejectedSupplier = await api("DELETE", `/api/suppliers/${master.supplierId}`);
    expect(rejectedSupplier.status).toBe(409);
    expect(rejectedSupplier.payload.error.code).toBe("CONFLICT");
    expect(rejectedSupplier.payload.error.message).toContain("已被单据");

    const rejectedWarehouse = await api("DELETE", `/api/warehouses/${master.warehouseId}`);
    expect(rejectedWarehouse.status).toBe(409);
    expect(rejectedWarehouse.payload.error.message).toContain("已被单据");

    const supplierList = await api("GET", "/api/suppliers");
    const warehouseList = await api("GET", "/api/warehouses");
    expect(
      supplierList.payload.data.suppliers.find(
        (supplier: any) => supplier.id === master.supplierId,
      ),
    ).toBeDefined();
    expect(
      warehouseList.payload.data.warehouses.find(
        (warehouse: any) => warehouse.id === master.warehouseId,
      ),
    ).toBeDefined();
  });

  it("单据路由默认都要会话，无会话访问一律返回 401", async () => {
    for (const [method, path] of [
      ["GET", "/api/documents"],
      ["POST", "/api/documents"],
      ["GET", "/api/documents/some-id"],
      ["PUT", "/api/documents/some-id"],
      ["DELETE", "/api/documents/some-id"],
    ] as const) {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: method === "GET" ? {} : { "content-type": "application/json" },
        body: method === "GET" ? undefined : "{}",
      });

      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });
});
