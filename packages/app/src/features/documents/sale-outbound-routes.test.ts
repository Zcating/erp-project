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

type SaleOutboundApp = {
  app: FastifyInstance;
  cookie: string;
  customerId: string;
  warehouseId: string;
  itemId: string;
};

const buildSaleOutboundApp = async (): Promise<SaleOutboundApp> => {
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
    code: "SUP-SOUT-001",
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customerId = await created("/api/customers", {
    code: "CUS-SOUT-001",
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouseId = await created("/api/warehouses", {
    code: "WH-SOUT-001",
    name: "杭州总仓",
    purpose: null,
  });
  const itemId = await created("/api/items", {
    code: "SKU-SOUT-001",
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
  const inboundId = inbound.json().data.id as string;
  const posted = await app.inject({
    method: "POST",
    url: `/api/documents/${inboundId}/post`,
    headers: { cookie },
  });
  expect(posted.statusCode).toBe(200);

  return { app, cookie, customerId, warehouseId, itemId };
};

const saleOutboundBody = (
  fixture: SaleOutboundApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "SALE_OUTBOUND",
  supplierId: null,
  customerId: fixture.customerId,
  sourceWarehouseId: fixture.warehouseId,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity: "5", unitPrice: "3.5", amount: null }],
  ...overrides,
});

const createDocument = async (fixture: SaleOutboundApp, body: Record<string, unknown>) => {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/documents",
    headers: { cookie: fixture.cookie },
    payload: body,
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as { id: string; documentNo: string; status: string };
};

const balancesOf = async (fixture: SaleOutboundApp) => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/balances?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.balances as Array<{
    warehouseId: string;
    itemId: string;
    onHand: string;
    available: string;
    inTransit: string;
    unitCost: string;
  }>;
};

const movementsOf = async (fixture: SaleOutboundApp, documentNo: string) => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/movements?documentNo=${documentNo}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.movements as Array<Record<string, unknown>>;
};

describe("销售出库过账与作废的 HTTP 表面", () => {
  it("过账后来源仓该商品的账面库存减少该行数量，流水记录结转成本与成本单价", async () => {
    const fixture = await buildSaleOutboundApp();
    const document = await createDocument(fixture, saleOutboundBody(fixture));

    const posted = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });

    expect(posted.statusCode).toBe(200);
    expect(posted.json().data.status).toBe("POSTED");
    expect(await balancesOf(fixture)).toEqual([
      {
        warehouseId: fixture.warehouseId,
        itemId: fixture.itemId,
        onHand: "7.000",
        available: "7.000",
        inTransit: "0.000",
        unitCost: "2.000000",
      },
    ]);
    const movements = await movementsOf(fixture, document.documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      direction: "POST",
      quantityBefore: "12.000",
      quantityAfter: "7.000",
      costBefore: "2.000000",
      costAfter: "2.000000",
      unitPrice: "2.000000",
      amount: "10.00",
    });

    await fixture.app.close();
  });

  it("库存不足时过账返回 409 且错误码为 STOCK_NEGATIVE，库存与流水都不发生变化", async () => {
    const fixture = await buildSaleOutboundApp();
    const document = await createDocument(
      fixture,
      saleOutboundBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "13", unitPrice: "3.5", amount: null }],
      }),
    );

    const posted = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });

    expect(posted.statusCode).toBe(409);
    expect(posted.json().error.code).toBe("STOCK_NEGATIVE");
    expect(posted.json().error.message).toContain("禁止负库存");
    expect(await balancesOf(fixture)).toEqual([
      {
        warehouseId: fixture.warehouseId,
        itemId: fixture.itemId,
        onHand: "12.000",
        available: "12.000",
        inTransit: "0.000",
        unitCost: "2.000000",
      },
    ]);
    expect(await movementsOf(fixture, document.documentNo)).toEqual([]);
    const reread = await fixture.app.inject({
      method: "GET",
      url: `/api/documents/${document.id}`,
      headers: { cookie: fixture.cookie },
    });
    expect(reread.json().data.status).toBe("DRAFT");

    await fixture.app.close();
  });

  it("作废后账面库存回到出库前，并新增一条数量相反的反向流水", async () => {
    const fixture = await buildSaleOutboundApp();
    const document = await createDocument(fixture, saleOutboundBody(fixture));
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });

    const voided = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/void`,
      headers: { cookie: fixture.cookie },
    });

    expect(voided.statusCode).toBe(200);
    expect(voided.json().data.status).toBe("VOIDED");
    expect(await balancesOf(fixture)).toEqual([
      {
        warehouseId: fixture.warehouseId,
        itemId: fixture.itemId,
        onHand: "12.000",
        available: "12.000",
        inTransit: "0.000",
        unitCost: "2.000000",
      },
    ]);
    const movements = await movementsOf(fixture, document.documentNo);
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({
      direction: "REVERSAL",
      quantityBefore: "7.000",
      quantityAfter: "12.000",
      unitPrice: "2.000000",
      amount: "-10.00",
    });

    await fixture.app.close();
  });
});
