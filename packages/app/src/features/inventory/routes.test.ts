import {
  createInMemoryCustomerRepository,
  createInMemoryDocumentRepository,
  createInMemoryItemMasterRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
} from "@erp-project/kernel";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "../session";

type InventoryApp = {
  app: FastifyInstance;
  cookie: string;
  supplierId: string;
  customerId: string;
  warehouseId: string;
  otherWarehouseId: string;
  itemId: string;
};

const buildInventoryApp = async (): Promise<InventoryApp> => {
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

const createDocument = async (
  fixture: InventoryApp,
  body: Record<string, unknown>,
): Promise<{ id: string; documentNo: string }> => {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/documents",
    headers: { cookie: fixture.cookie },
    payload: body,
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as { id: string; documentNo: string };
};

const postDocument = async (fixture: InventoryApp, documentId: string): Promise<void> => {
  const response = await fixture.app.inject({
    method: "POST",
    url: `/api/documents/${documentId}/post`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
};

const purchaseInbound = (
  fixture: InventoryApp,
  quantity: string,
  unitPrice: string,
  targetWarehouseId = fixture.warehouseId,
): Record<string, unknown> => ({
  type: "PURCHASE_INBOUND",
  supplierId: fixture.supplierId,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity, unitPrice, amount: null }],
});

const balancesOf = async (
  fixture: InventoryApp,
  query: string,
): Promise<Array<Record<string, unknown>>> => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/balances${query}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.balances as Array<Record<string, unknown>>;
};

const movementsOf = async (
  fixture: InventoryApp,
  query: string,
): Promise<Array<Record<string, unknown>>> => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/movements${query}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.movements as Array<Record<string, unknown>>;
};

describe("库存查询与库存流水的 HTTP 表面", () => {
  it("库存查询返回的每条记录同时含 onHand、available、inTransit 三个字段，字段名逐字匹配", async () => {
    const fixture = await buildInventoryApp();
    const document = await createDocument(fixture, purchaseInbound(fixture, "12", "1.115"));
    await postDocument(fixture, document.id);

    const balances = await balancesOf(
      fixture,
      `?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
    );

    expect(balances).toHaveLength(1);
    expect(Object.keys(balances[0] ?? {})).toEqual(
      expect.arrayContaining(["onHand", "available", "inTransit"]),
    );
    expect(balances[0]?.onHand).toBe("12.000");
    expect(balances[0]?.available).toBe("12.000");
    expect(balances[0]?.inTransit).toBe("0.000");
    expect(balances[0]?.unitCost).toBe("1.115000");

    await fixture.app.close();
  });

  it("库存查询的响应里没有名为 quantity 的字段", async () => {
    const fixture = await buildInventoryApp();
    const document = await createDocument(fixture, purchaseInbound(fixture, "12", "1.115"));
    await postDocument(fixture, document.id);

    const response = await fixture.app.inject({
      method: "GET",
      url: `/api/inventory/balances?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
      headers: { cookie: fixture.cookie },
    });

    expect(Object.keys(response.json().data.balances[0] ?? {})).not.toContain("quantity");
    expect(JSON.stringify(response.json().data.balances)).not.toContain('"quantity"');

    await fixture.app.close();
  });

  it("本版本可用库存等于账面库存：账面为 7 时返回的账面库存为 7、可用库存为 7", async () => {
    const fixture = await buildInventoryApp();
    const inbound = await createDocument(fixture, purchaseInbound(fixture, "12", "1.115"));
    await postDocument(fixture, inbound.id);
    const outbound = await createDocument(fixture, {
      type: "SALE_OUTBOUND",
      supplierId: null,
      customerId: fixture.customerId,
      sourceWarehouseId: fixture.warehouseId,
      targetWarehouseId: null,
      warehouseId: null,
      lines: [{ itemId: fixture.itemId, quantity: "5", unitPrice: "2", amount: null }],
    });
    await postDocument(fixture, outbound.id);

    const balances = await balancesOf(
      fixture,
      `?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
    );

    expect(balances[0]?.onHand).toBe("7.000");
    expect(balances[0]?.available).toBe("7.000");
    expect(balances[0]?.inTransit).toBe("0.000");

    await fixture.app.close();
  });

  it("库存查询可按仓库与商品过滤，两个仓库各自返回自己的口径值", async () => {
    const fixture = await buildInventoryApp();
    const first = await createDocument(fixture, purchaseInbound(fixture, "12", "1.115"));
    await postDocument(fixture, first.id);
    const second = await createDocument(
      fixture,
      purchaseInbound(fixture, "3", "1.115", fixture.otherWarehouseId),
    );
    await postDocument(fixture, second.id);

    const inFirstWarehouse = await balancesOf(
      fixture,
      `?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
    );
    const inSecondWarehouse = await balancesOf(
      fixture,
      `?warehouseId=${fixture.otherWarehouseId}&itemId=${fixture.itemId}`,
    );

    expect(inFirstWarehouse[0]?.onHand).toBe("12.000");
    expect(inSecondWarehouse[0]?.onHand).toBe("3.000");

    await fixture.app.close();
  });

  it("库存流水可按单据号查询，返回该单据产生的全部流水行，每行含单据号、行号、变动前后数量与成本、单价与结转金额", async () => {
    const fixture = await buildInventoryApp();
    const document = await createDocument(fixture, purchaseInbound(fixture, "12", "1.115"));
    await postDocument(fixture, document.id);

    const movements = await movementsOf(fixture, `?documentNo=${document.documentNo}`);

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      documentNo: document.documentNo,
      lineNo: 1,
      quantityBefore: "0.000",
      quantityAfter: "12.000",
      costBefore: "0.000000",
      costAfter: "1.115000",
      unitPrice: "1.115000",
      amount: "13.38",
    });

    await fixture.app.close();
  });

  it("库存流水可按行号与时间筛选与排序", async () => {
    const fixture = await buildInventoryApp();
    const first = await createDocument(fixture, purchaseInbound(fixture, "12", "1.115"));
    await postDocument(fixture, first.id);
    const second = await createDocument(fixture, purchaseInbound(fixture, "3", "1.115"));
    await postDocument(fixture, second.id);

    const all = await movementsOf(fixture, "");
    expect(all).toHaveLength(2);

    const byLineNo = await movementsOf(fixture, "?lineNo=1");
    expect(byLineNo).toHaveLength(2);

    const noSuchLineNo = await movementsOf(fixture, "?lineNo=9");
    expect(noSuchLineNo).toEqual([]);

    const inRange = await movementsOf(
      fixture,
      "?from=2000-01-01T00:00:00.000Z&to=2100-01-01T00:00:00.000Z",
    );
    expect(inRange).toHaveLength(2);

    const outOfRange = await movementsOf(fixture, "?from=2100-01-01T00:00:00.000Z");
    expect(outOfRange).toEqual([]);

    const descending = await movementsOf(fixture, "?order=desc");
    expect(descending.map((movement) => movement.documentNo)).toEqual([
      second.documentNo,
      first.documentNo,
    ]);

    await fixture.app.close();
  });

  it("不存在修改或删除库存流水的接口：PUT 与 DELETE 返回 404 或 405，流水内容与条数不变", async () => {
    const fixture = await buildInventoryApp();
    const document = await createDocument(fixture, purchaseInbound(fixture, "12", "1.115"));
    await postDocument(fixture, document.id);
    const before = await movementsOf(fixture, `?documentNo=${document.documentNo}`);

    for (const method of ["PUT", "DELETE"] as const) {
      const response = await fixture.app.inject({
        method,
        url: `/api/inventory/movements?documentNo=${document.documentNo}`,
        headers: { cookie: fixture.cookie },
        payload: { quantity: "999.000" },
      });

      expect([404, 405]).toContain(response.statusCode);
    }

    const after = await movementsOf(fixture, `?documentNo=${document.documentNo}`);
    expect(after).toEqual(before);
    expect(after).toHaveLength(1);

    await fixture.app.close();
  });

  it("库存流水的筛选参数不合法时返回 400 与 VALIDATION 错误信封", async () => {
    const fixture = await buildInventoryApp();

    for (const query of ["?lineNo=0", "?lineNo=abc", "?from=not-a-time", "?order=sideways"]) {
      const response = await fixture.app.inject({
        method: "GET",
        url: `/api/inventory/movements${query}`,
        headers: { cookie: fixture.cookie },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION");
    }

    await fixture.app.close();
  });

  it("库存路由默认要会话，无会话访问一律返回 401", async () => {
    const fixture = await buildInventoryApp();

    for (const url of ["/api/inventory/balances", "/api/inventory/movements"]) {
      const response = await fixture.app.inject({ method: "GET", url });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHENTICATED");
    }

    await fixture.app.close();
  });
});
