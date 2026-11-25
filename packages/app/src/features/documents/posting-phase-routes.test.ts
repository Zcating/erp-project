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

type PhaseApp = {
  app: FastifyInstance;
  cookie: string;
  warehouseId: string;
  supplierId: string;
  itemId: string;
};

const buildPhaseApp = async (): Promise<PhaseApp> => {
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

  return { app, cookie, warehouseId, supplierId, itemId };
};

describe("过账阶段在 HTTP 边界的校验", () => {
  it("全局非法的阶段名在 API 边界被拒，不进到内核", async () => {
    const fixture = await buildPhaseApp();
    const document = await fixture.app.inject({
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
        lines: [{ itemId: fixture.itemId, quantity: "12", unitPrice: "1.115", amount: null }],
      },
    });
    expect(document.statusCode).toBe(200);
    const documentId = document.json().data.id as string;

    const rejected = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${documentId}/post`,
      headers: { cookie: fixture.cookie },
      payload: { phase: "SIDEWAYS" },
    });

    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.message).toBe("未知过账阶段：SIDEWAYS");

    await fixture.app.close();
  });

  it("全局合法但该单据类型不支持的阶段仍由内核那条消息拒绝", async () => {
    const fixture = await buildPhaseApp();
    const document = await fixture.app.inject({
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
        lines: [{ itemId: fixture.itemId, quantity: "12", unitPrice: "1.115", amount: null }],
      },
    });
    const documentId = document.json().data.id as string;
    const documentNo = document.json().data.documentNo as string;

    const rejected = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${documentId}/post`,
      headers: { cookie: fixture.cookie },
      payload: { phase: "IN" },
    });

    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.message).toBe(`单据 ${documentNo} 不支持的过账阶段：IN`);

    await fixture.app.close();
  });
});
