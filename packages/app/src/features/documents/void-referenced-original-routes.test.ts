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

type DocumentApp = {
  app: FastifyInstance;
  cookie: string;
  supplierId: string;
  customerId: string;
  warehouseId: string;
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

  return { app, cookie, supplierId, customerId, warehouseId, itemId };
};

describe("作废被已过账退货单引用的原单据的 HTTP 表面", () => {
  it("作废被已过账销售退货单引用的销售出库单返回 409，错误消息指出被引用的退货单并要求先作废它", async () => {
    const fixture = await buildDocumentApp();

    const inboundId = await fixture.app
      .inject({
        method: "POST",
        url: "/api/documents",
        headers: { cookie: fixture.cookie },
        payload: {
          type: "PURCHASE_INBOUND",
          supplierId: fixture.supplierId,
          customerId: null,
          sourceWarehouseId: null,
          targetWarehouseId: fixture.warehouseId,
          warehouseId: null,
          lines: [{ itemId: fixture.itemId, quantity: "10", unitPrice: "2", amount: null }],
        },
      })
      .then((response) => response.json().data.id as string);
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${inboundId}/post`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });

    const outbound = await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: {
        type: "SALE_OUTBOUND",
        supplierId: null,
        customerId: fixture.customerId,
        sourceWarehouseId: fixture.warehouseId,
        targetWarehouseId: null,
        warehouseId: null,
        lines: [{ itemId: fixture.itemId, quantity: "10", unitPrice: "3.5", amount: null }],
      },
    });
    const outboundId = outbound.json().data.id as string;
    const outboundDocumentNo = outbound.json().data.documentNo as string;
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${outboundId}/post`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });

    const originalLineId = outbound.json().data.lines[0].id as string;
    const saleReturn = await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: {
        type: "SALE_RETURN",
        supplierId: null,
        customerId: null,
        sourceWarehouseId: null,
        targetWarehouseId: null,
        warehouseId: null,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: "10",
            unitPrice: null,
            amount: null,
            originalLineId,
          },
        ],
      },
    });
    const saleReturnId = saleReturn.json().data.id as string;
    const saleReturnDocumentNo = saleReturn.json().data.documentNo as string;
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${saleReturnId}/post`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });

    const rejected = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${outboundId}/void`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });

    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("STATE_CONFLICT");
    expect(rejected.json().error.message).toContain(outboundDocumentNo);
    expect(rejected.json().error.message).toContain("已被过账的退货单引用");
    expect(rejected.json().error.message).toContain(saleReturnDocumentNo);
    expect(rejected.json().error.message).toContain("请先作废退货单");

    const balances = await fixture.app.inject({
      method: "GET",
      url: `/api/inventory/balances?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(balances.json().data.balances[0].onHand).toBe("10.000");

    await fixture.app.close();
  });

  it("先作废退货单后再作废原单据成功，账面库存先回到 0.000 再回到 10.000", async () => {
    const fixture = await buildDocumentApp();

    const inboundId = await fixture.app
      .inject({
        method: "POST",
        url: "/api/documents",
        headers: { cookie: fixture.cookie },
        payload: {
          type: "PURCHASE_INBOUND",
          supplierId: fixture.supplierId,
          customerId: null,
          sourceWarehouseId: null,
          targetWarehouseId: fixture.warehouseId,
          warehouseId: null,
          lines: [{ itemId: fixture.itemId, quantity: "10", unitPrice: "2", amount: null }],
        },
      })
      .then((response) => response.json().data.id as string);
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${inboundId}/post`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });

    const outbound = await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: {
        type: "SALE_OUTBOUND",
        supplierId: null,
        customerId: fixture.customerId,
        sourceWarehouseId: fixture.warehouseId,
        targetWarehouseId: null,
        warehouseId: null,
        lines: [{ itemId: fixture.itemId, quantity: "10", unitPrice: "3.5", amount: null }],
      },
    });
    const outboundId = outbound.json().data.id as string;
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${outboundId}/post`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });

    const saleReturn = await fixture.app.inject({
      method: "POST",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
      payload: {
        type: "SALE_RETURN",
        supplierId: null,
        customerId: null,
        sourceWarehouseId: null,
        targetWarehouseId: null,
        warehouseId: null,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: "10",
            unitPrice: null,
            amount: null,
            originalLineId: outbound.json().data.lines[0].id as string,
          },
        ],
      },
    });
    const saleReturnId = saleReturn.json().data.id as string;
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${saleReturnId}/post`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });

    const voidedReturn = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${saleReturnId}/void`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });
    expect(voidedReturn.statusCode).toBe(200);

    const afterReturn = await fixture.app.inject({
      method: "GET",
      url: `/api/inventory/balances?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(afterReturn.json().data.balances[0].onHand).toBe("0.000");

    const voidedOutbound = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${outboundId}/void`,
      headers: { cookie: fixture.cookie },
      payload: {},
    });
    expect(voidedOutbound.statusCode).toBe(200);

    const afterOutbound = await fixture.app.inject({
      method: "GET",
      url: `/api/inventory/balances?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
      headers: { cookie: fixture.cookie },
    });
    expect(afterOutbound.json().data.balances[0].onHand).toBe("10.000");

    await fixture.app.close();
  });
});
