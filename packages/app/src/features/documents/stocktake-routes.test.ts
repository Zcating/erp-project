import {
  createInMemoryCustomerRepository,
  createInMemoryDocumentRepository,
  createInMemoryItemMasterRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
} from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app.js";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "../session/index.js";

type StocktakeApp = {
  app: FastifyInstance;
  cookie: string;
  supplierId: string;
  customerId: string;
  warehouseId: string;
  itemId: string;
};

const buildStocktakeApp = async (): Promise<StocktakeApp> => {
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
    code: "SUP-STK-001",
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customerId = await created("/api/customers", {
    code: "CUS-STK-001",
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouseId = await created("/api/warehouses", {
    code: "WH-STK-001",
    name: "杭州总仓",
    purpose: null,
  });
  const itemId = await created("/api/items", {
    code: "SKU-STK-001",
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  });

  const inbound = await app.inject({
    method: "POST",
    url: "/api/documents",
    headers: { cookie },
    payload: {
      type: "PURCHASE_INBOUND",
      supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: warehouseId,
      warehouseId: null,
      lines: [{ itemId, quantity: "12", unitPrice: "2", amount: null }],
    },
  });
  expect(inbound.statusCode).toBe(200);
  await app.inject({
    method: "POST",
    url: `/api/documents/${inbound.json().data.id as string}/post`,
    headers: { cookie },
  });

  return { app, cookie, supplierId, customerId, warehouseId, itemId };
};

const stocktakeBody = (
  fixture: StocktakeApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "STOCKTAKE",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: fixture.warehouseId,
  lines: [{ itemId: fixture.itemId, quantity: "12", unitPrice: null, amount: null }],
  ...overrides,
});

const createStocktake = async (fixture: StocktakeApp, body: Record<string, unknown>) =>
  fixture.app.inject({
    method: "POST",
    url: "/api/documents",
    headers: { cookie: fixture.cookie },
    payload: body,
  });

const postDocument = async (fixture: StocktakeApp, documentId: string) =>
  fixture.app.inject({
    method: "POST",
    url: `/api/documents/${documentId}/post`,
    headers: { cookie: fixture.cookie },
  });

const balancesOf = async (fixture: StocktakeApp) => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/balances?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.balances as Array<{ onHand: string; unitCost: string }>;
};

const movementsOf = async (fixture: StocktakeApp, documentNo: string) => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/movements?documentNo=${documentNo}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.movements as Array<Record<string, unknown>>;
};

describe("盘点的 HTTP 表面", () => {
  it("新建盘点单草稿时单号形如 STK-<YYYYMMDD>-<当日序号>，行上只有商品与实盘数量", async () => {
    const fixture = await buildStocktakeApp();

    const response = await createStocktake(fixture, stocktakeBody(fixture));

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("DRAFT");
    expect(response.json().data.documentNo).toMatch(/^STK-\d{8}-\d{3}$/);
    expect(response.json().data.warehouseId).toBe(fixture.warehouseId);
    expect(response.json().data.lines[0].quantity).toBe("12.000");
    expect(response.json().data.lines[0].unitPrice).toBeNull();
    expect(response.json().data.lines[0].amount).toBeNull();

    await fixture.app.close();
  });

  it("同一张盘点单内同一商品重复出现时保存失败，错误消息指出重复的商品", async () => {
    const fixture = await buildStocktakeApp();

    const response = await createStocktake(
      fixture,
      stocktakeBody(fixture, {
        lines: [
          { itemId: fixture.itemId, quantity: "12", unitPrice: null, amount: null },
          { itemId: fixture.itemId, quantity: "10", unitPrice: null, amount: null },
        ],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.message).toContain("同一商品不能重复出现");
    expect(response.json().error.message).toContain("SKU-STK-001");

    await fixture.app.close();
  });

  it("实盘数量为负数时保存失败，错误消息指出实盘数量不能为负数", async () => {
    const fixture = await buildStocktakeApp();

    const response = await createStocktake(
      fixture,
      stocktakeBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "-1", unitPrice: null, amount: null }],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.message).toContain("实盘数量不能为负数");

    await fixture.app.close();
  });

  it("实盘数量大于账面数量时过账后账面库存增加差额，流水记录按当前加权平均成本计算的入库", async () => {
    const fixture = await buildStocktakeApp();
    const created = await createStocktake(
      fixture,
      stocktakeBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "15", unitPrice: null, amount: null }],
      }),
    );
    const documentId = created.json().data.id as string;
    const documentNo = created.json().data.documentNo as string;

    const posted = await postDocument(fixture, documentId);

    expect(posted.statusCode).toBe(200);
    expect(posted.json().data.status).toBe("POSTED");
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "15.000", unitCost: "2.000000" }]);
    const movements = await movementsOf(fixture, documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      direction: "POST",
      quantityBefore: "12.000",
      quantityAfter: "15.000",
      costBefore: "2.000000",
      costAfter: "2.000000",
      unitPrice: "2.000000",
      amount: "6.00",
    });

    await fixture.app.close();
  });

  it("实盘数量小于账面数量时过账后账面库存减少差额，流水记录按当前加权平均成本计算的出库", async () => {
    const fixture = await buildStocktakeApp();
    const created = await createStocktake(
      fixture,
      stocktakeBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "9", unitPrice: null, amount: null }],
      }),
    );
    const documentId = created.json().data.id as string;
    const documentNo = created.json().data.documentNo as string;

    const posted = await postDocument(fixture, documentId);

    expect(posted.statusCode).toBe(200);
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "9.000", unitCost: "2.000000" }]);
    const movements = await movementsOf(fixture, documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      direction: "POST",
      quantityBefore: "12.000",
      quantityAfter: "9.000",
      unitPrice: "2.000000",
      amount: "6.00",
    });

    await fixture.app.close();
  });

  it("实盘数量为 0 时过账后该商品在该仓的账面库存归零", async () => {
    const fixture = await buildStocktakeApp();
    const created = await createStocktake(
      fixture,
      stocktakeBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "0", unitPrice: null, amount: null }],
      }),
    );

    const posted = await postDocument(fixture, created.json().data.id as string);

    expect(posted.statusCode).toBe(200);
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "0.000" }]);

    await fixture.app.close();
  });

  it("实盘数量等于账面数量时过账成功，账面库存不变，库存流水里查不到该单任何行", async () => {
    const fixture = await buildStocktakeApp();
    const created = await createStocktake(fixture, stocktakeBody(fixture));
    const documentId = created.json().data.id as string;
    const documentNo = created.json().data.documentNo as string;

    const posted = await postDocument(fixture, documentId);

    expect(posted.statusCode).toBe(200);
    expect(posted.json().data.status).toBe("POSTED");
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "12.000", unitCost: "2.000000" }]);
    expect(await movementsOf(fixture, documentNo)).toEqual([]);

    await fixture.app.close();
  });

  it("作废后账面库存回到过账前，并追加一条数量相反的反向流水", async () => {
    const fixture = await buildStocktakeApp();
    const created = await createStocktake(
      fixture,
      stocktakeBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "15", unitPrice: null, amount: null }],
      }),
    );
    const documentId = created.json().data.id as string;
    const documentNo = created.json().data.documentNo as string;
    await postDocument(fixture, documentId);

    const voided = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${documentId}/void`,
      headers: { cookie: fixture.cookie },
    });

    expect(voided.statusCode).toBe(200);
    expect(voided.json().data.status).toBe("VOIDED");
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "12.000", unitCost: "2.000000" }]);
    const movements = await movementsOf(fixture, documentNo);
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({
      direction: "REVERSAL",
      quantityBefore: "15.000",
      quantityAfter: "12.000",
      unitPrice: "2.000000",
      amount: "-6.00",
    });

    await fixture.app.close();
  });

  it("盘点的过账与作废接口都要会话", async () => {
    const fixture = await buildStocktakeApp();
    const created = await createStocktake(fixture, stocktakeBody(fixture));
    const documentId = created.json().data.id as string;

    for (const url of [`/api/documents/${documentId}/post`, `/api/documents/${documentId}/void`]) {
      const response = await fixture.app.inject({ method: "POST", url });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHENTICATED");
    }

    await fixture.app.close();
  });
});
