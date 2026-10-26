import {
  createInMemoryCustomerRepository,
  createInMemoryDocumentRepository,
  createInMemoryItemMasterRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
} from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "../session";

type DocumentApp = {
  app: FastifyInstance;
  cookie: string;
  supplierId: string;
  customerId: string;
  warehouseId: string;
  otherWarehouseId: string;
  itemId: string;
};

const buildDocumentApp = async (): Promise<DocumentApp> => {
  const app = buildApp({
    itemMasterRepository: createInMemoryItemMasterRepository(),
    supplierRepository: createInMemorySupplierRepository(),
    customerRepository: createInMemoryCustomerRepository(),
    warehouseRepository: createInMemoryWarehouseRepository(),
    documentRepository: createInMemoryDocumentRepository(),
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD },
  });
  const header = login.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) {
    throw new Error("登录响应没有下发 set-cookie");
  }
  const cookie = value.split(";")[0] ?? "";

  const created = async (path: string, payload: Record<string, unknown>): Promise<string> => {
    const response = await app.inject({
      method: "POST",
      url: path,
      headers: { cookie },
      payload,
    });
    expect(response.statusCode).toBe(200);
    return response.json().data.id as string;
  };

  const supplierId = await created("/api/suppliers", {
    code: "SUP-001",
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customerId = await created("/api/customers", {
    code: "CUS-001",
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouseId = await created("/api/warehouses", {
    code: "WH-001",
    name: "杭州总仓",
    purpose: null,
  });
  const otherWarehouseId = await created("/api/warehouses", {
    code: "WH-002",
    name: "杭州分仓",
    purpose: null,
  });
  const itemId = await created("/api/items", {
    code: "SKU-001",
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  });

  return { app, cookie, supplierId, customerId, warehouseId, otherWarehouseId, itemId };
};

const purchaseInboundBody = (
  fixture: DocumentApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "PURCHASE_INBOUND",
  supplierId: fixture.supplierId,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: fixture.warehouseId,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity: "3", unitPrice: "1.115", amount: null }],
  ...overrides,
});

const saleOutboundBody = (
  fixture: DocumentApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "SALE_OUTBOUND",
  supplierId: null,
  customerId: fixture.customerId,
  sourceWarehouseId: fixture.warehouseId,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity: "1", unitPrice: "2", amount: null }],
  ...overrides,
});

const stocktakeBody = (
  fixture: DocumentApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "STOCKTAKE",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: fixture.warehouseId,
  lines: [{ itemId: fixture.itemId, quantity: "0", unitPrice: null, amount: null }],
  ...overrides,
});

const transferBody = (
  fixture: DocumentApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "TRANSFER",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: fixture.warehouseId,
  targetWarehouseId: fixture.otherWarehouseId,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity: "2", unitPrice: "1.5", amount: null }],
  ...overrides,
});

describe("单据 HTTP 表面", () => {
  it("单据路由默认都要会话，无会话访问一律返回 401", async () => {
    const app = buildApp({
      itemMasterRepository: createInMemoryItemMasterRepository(),
      supplierRepository: createInMemorySupplierRepository(),
      customerRepository: createInMemoryCustomerRepository(),
      warehouseRepository: createInMemoryWarehouseRepository(),
      documentRepository: createInMemoryDocumentRepository(),
    });

    for (const [method, url] of [
      ["GET", "/api/documents"],
      ["POST", "/api/documents"],
      ["GET", "/api/documents/some-id"],
      ["PUT", "/api/documents/some-id"],
      ["DELETE", "/api/documents/some-id"],
    ] as const) {
      const response =
        method === "GET"
          ? await app.inject({ method, url })
          : await app.inject({ method, url, payload: {} });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHENTICATED");
    }

    await app.close();
  });

  it("四类草稿各自新建一条，单号形如 <前缀>-<YYYYMMDD>-<当日序号>，状态都是草稿", async () => {
    const fixture = await buildDocumentApp();

    const bodies = [
      { body: purchaseInboundBody(fixture), prefix: "PIN" },
      { body: saleOutboundBody(fixture), prefix: "SOUT" },
      { body: stocktakeBody(fixture), prefix: "STK" },
      { body: transferBody(fixture), prefix: "TRF" },
    ];

    for (const { body, prefix } of bodies) {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { cookie: fixture.cookie },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.status).toBe("DRAFT");
      expect(response.json().data.documentNo).toMatch(new RegExp(`^${prefix}-\\d{8}-\\d{3}$`));
    }

    await fixture.app.close();
  });

  it("列表可以按单据类型筛选，筛选结果只含该类型单据", async () => {
    const fixture = await buildDocumentApp();
    await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: purchaseInboundBody(fixture),
    });
    await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: saleOutboundBody(fixture),
    });

    const filtered = await fixture.app.inject({
      method: "GET",
      url: "/api/documents?type=SALE_OUTBOUND",
      headers: { cookie: fixture.cookie },
    });
    expect(filtered.json().data.documents).toHaveLength(1);
    expect(filtered.json().data.documents[0].type).toBe("SALE_OUTBOUND");

    const byStatus = await fixture.app.inject({
      method: "GET",
      url: "/api/documents?status=DRAFT",
      headers: { cookie: fixture.cookie },
    });
    expect(byStatus.json().data.documents).toHaveLength(2);

    await fixture.app.close();
  });

  it("编辑草稿后能读回修改后的数量与单价，删除草稿后列表里不再显示", async () => {
    const fixture = await buildDocumentApp();
    const created = await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: purchaseInboundBody(fixture),
    });
    const documentId = created.json().data.id as string;

    const updated = await fixture.app.inject({
      method: "PUT",
      url: `/api/documents/${documentId}`,
      headers: { cookie: fixture.cookie },
      payload: purchaseInboundBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "4", unitPrice: "1.115", amount: null }],
      }),
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.lines[0].quantity).toBe("4.000");
    expect(updated.json().data.lines[0].unitPrice).toBe("1.115000");
    expect(updated.json().data.lines[0].amount).toBe("4.46");

    const reread = await fixture.app.inject({
      method: "GET",
      url: `/api/documents/${documentId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(reread.json().data.lines[0].quantity).toBe("4.000");

    const deleted = await fixture.app.inject({
      method: "DELETE",
      url: `/api/documents/${documentId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(deleted.statusCode).toBe(200);

    const list = await fixture.app.inject({
      method: "GET",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
    });
    expect(
      list.json().data.documents.find((document: { id: string }) => document.id === documentId),
    ).toBeUndefined();

    await fixture.app.close();
  });

  it("单据行金额按金额精度保存：单价 1.115、数量 3 得 3.35，数量改成 4 得 4.46", async () => {
    const fixture = await buildDocumentApp();

    const created = await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: purchaseInboundBody(fixture),
    });
    expect(created.json().data.lines[0].amount).toBe("3.35");

    const updated = await fixture.app.inject({
      method: "PUT",
      url: `/api/documents/${created.json().data.id}`,
      headers: { cookie: fixture.cookie },
      payload: purchaseInboundBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "4", unitPrice: "1.115", amount: null }],
      }),
    });
    expect(updated.json().data.lines[0].amount).toBe("4.46");

    await fixture.app.close();
  });

  it("缺少该类型要求的参与方与仓库时保存失败，错误消息指出缺哪一项", async () => {
    const fixture = await buildDocumentApp();

    const cases: Array<{ body: Record<string, unknown>; message: string }> = [
      { body: purchaseInboundBody(fixture, { supplierId: null }), message: "缺少供应商" },
      {
        body: purchaseInboundBody(fixture, { targetWarehouseId: null }),
        message: "缺少目标仓库",
      },
      { body: saleOutboundBody(fixture, { customerId: null }), message: "缺少客户" },
      {
        body: saleOutboundBody(fixture, { sourceWarehouseId: null }),
        message: "缺少来源仓库",
      },
      { body: stocktakeBody(fixture, { warehouseId: null }), message: "缺少仓库" },
      { body: transferBody(fixture, { sourceWarehouseId: null }), message: "缺少源仓" },
      { body: transferBody(fixture, { targetWarehouseId: null }), message: "缺少目标仓" },
    ];

    for (const { body, message } of cases) {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { cookie: fixture.cookie },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION");
      expect(response.json().error.message).toBe(message);
    }

    await fixture.app.close();
  });

  it("源仓与目标仓相同的调拨单保存失败，错误消息指出源仓与目标仓必须不同", async () => {
    const fixture = await buildDocumentApp();

    const response = await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: transferBody(fixture, { targetWarehouseId: fixture.warehouseId }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe("源仓与目标仓必须不同");

    await fixture.app.close();
  });

  it("单据行数量为 0 或负数、单价为负数时保存失败，错误消息指出哪一项不合法", async () => {
    const fixture = await buildDocumentApp();

    const cases: Array<{ lines: unknown[]; message: string }> = [
      {
        lines: [{ itemId: fixture.itemId, quantity: "0", unitPrice: "1", amount: null }],
        message: "第 1 行数量必须大于 0：0",
      },
      {
        lines: [{ itemId: fixture.itemId, quantity: "-1", unitPrice: "1", amount: null }],
        message: "第 1 行数量必须大于 0：-1",
      },
      {
        lines: [{ itemId: fixture.itemId, quantity: "1", unitPrice: "-1", amount: null }],
        message: "第 1 行单价不能为负数：-1",
      },
    ];

    for (const { lines, message } of cases) {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { cookie: fixture.cookie },
        payload: purchaseInboundBody(fixture, { lines }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toBe(message);
    }

    await fixture.app.close();
  });

  it("盘点行带单价或金额时保存失败，错误消息指出盘点行不含单价与金额", async () => {
    const fixture = await buildDocumentApp();

    for (const lines of [
      [{ itemId: fixture.itemId, quantity: "1", unitPrice: "1.5", amount: null }],
      [{ itemId: fixture.itemId, quantity: "1", unitPrice: null, amount: "1.50" }],
    ]) {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/api/documents",
        headers: { cookie: fixture.cookie },
        payload: stocktakeBody(fixture, { lines }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toBe("第 1 行盘点行不含单价与金额");
    }

    await fixture.app.close();
  });

  it("被单据引用的供应商、客户、仓库删除请求被拒，记录仍在列表中", async () => {
    const fixture = await buildDocumentApp();
    await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: purchaseInboundBody(fixture),
    });

    const rejectedSupplier = await fixture.app.inject({
      method: "DELETE",
      url: `/api/suppliers/${fixture.supplierId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(rejectedSupplier.statusCode).toBe(409);
    expect(rejectedSupplier.json().error.code).toBe("CONFLICT");
    expect(rejectedSupplier.json().error.message).toContain("已被单据");
    expect(rejectedSupplier.json().error.message).toContain("不能删除");

    const rejectedWarehouse = await fixture.app.inject({
      method: "DELETE",
      url: `/api/warehouses/${fixture.warehouseId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(rejectedWarehouse.statusCode).toBe(409);
    expect(rejectedWarehouse.json().error.message).toContain("已被单据");

    const supplierList = await fixture.app.inject({
      method: "GET",
      url: "/api/suppliers",
      headers: { cookie: fixture.cookie },
    });
    const warehouseList = await fixture.app.inject({
      method: "GET",
      url: "/api/warehouses",
      headers: { cookie: fixture.cookie },
    });
    expect(
      supplierList
        .json()
        .data.suppliers.find((supplier: { id: string }) => supplier.id === fixture.supplierId),
    ).toBeDefined();
    expect(
      warehouseList
        .json()
        .data.warehouses.find((warehouse: { id: string }) => warehouse.id === fixture.warehouseId),
    ).toBeDefined();

    await fixture.app.close();
  });

  it("被单据引用的客户删除请求同样被拒，没有被引用的客户仍可删除", async () => {
    const fixture = await buildDocumentApp();
    await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: saleOutboundBody(fixture),
    });

    const rejected = await fixture.app.inject({
      method: "DELETE",
      url: `/api/customers/${fixture.customerId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.message).toContain("客户已被单据");

    const spare = await fixture.app.inject({
      method: "POST",
      url: "/api/customers",
      headers: { cookie: fixture.cookie },
      payload: { code: "CUS-002", name: "上海百货", contact: null },
    });
    const deleted = await fixture.app.inject({
      method: "DELETE",
      url: `/api/customers/${spare.json().data.id}`,
      headers: { cookie: fixture.cookie },
    });
    expect(deleted.statusCode).toBe(200);

    await fixture.app.close();
  });

  it("未知单据类型与未知单据状态返回 400 与明确提示", async () => {
    const fixture = await buildDocumentApp();

    const unknownType = await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: purchaseInboundBody(fixture, { type: "NOT_A_TYPE" }),
    });
    expect(unknownType.statusCode).toBe(400);
    expect(unknownType.json().error.message).toBe("未知单据类型：NOT_A_TYPE");

    const unknownStatus = await fixture.app.inject({
      method: "GET",
      url: "/api/documents?status=NOT_A_STATUS",
      headers: { cookie: fixture.cookie },
    });
    expect(unknownStatus.statusCode).toBe(400);
    expect(unknownStatus.json().error.message).toBe("未知单据状态：NOT_A_STATUS");

    await fixture.app.close();
  });

  it("取不存在的单据返回 404", async () => {
    const fixture = await buildDocumentApp();

    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/documents/missing-id",
      headers: { cookie: fixture.cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");

    await fixture.app.close();
  });
});
