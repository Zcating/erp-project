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

type PostingApp = {
  app: FastifyInstance;
  cookie: string;
  supplierId: string;
  warehouseId: string;
  otherWarehouseId: string;
  itemId: string;
  draftItemId: string;
};

const buildPostingApp = async (): Promise<PostingApp> => {
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
    auxiliaryUnits: [{ unit: "箱", conversionRate: "12" }],
  });
  const draftItemId = await created("/api/items", {
    code: "SKU-002",
    barcode: null,
    name: "雪碧",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  });

  return { app, cookie, supplierId, warehouseId, otherWarehouseId, itemId, draftItemId };
};

const purchaseInboundBody = (
  fixture: PostingApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "PURCHASE_INBOUND",
  supplierId: fixture.supplierId,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: fixture.warehouseId,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity: "12", unitPrice: "1.115", amount: null }],
  ...overrides,
});

const createDocument = async (fixture: PostingApp, body: Record<string, unknown>) => {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/documents",
    headers: { cookie: fixture.cookie },
    payload: body,
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as { id: string; documentNo: string; status: string };
};

const balancesOf = async (fixture: PostingApp) => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/balances?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.balances as Array<{
    warehouseId: string;
    itemId: string;
    quantity: string;
    unitCost: string;
  }>;
};

const movementsOf = async (fixture: PostingApp, documentNo: string) => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/movements?documentNo=${documentNo}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.movements as Array<Record<string, unknown>>;
};

describe("过账与作废的 HTTP 表面", () => {
  it("过账后单据状态为已过账，目标仓该商品的账面数量与加权平均成本写入库存台账", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));

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
        quantity: "12.000",
        unitCost: "1.115000",
      },
    ]);

    await fixture.app.close();
  });

  it("同一张单连续过账两次，第二次返回 200，库存数量、流水条数与加权平均成本都不变", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));

    const first = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });
    const second = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.status).toBe("POSTED");
    expect(await balancesOf(fixture)).toEqual([
      {
        warehouseId: fixture.warehouseId,
        itemId: fixture.itemId,
        quantity: "12.000",
        unitCost: "1.115000",
      },
    ]);
    expect(await movementsOf(fixture, document.documentNo)).toHaveLength(1);

    await fixture.app.close();
  });

  it("作废后库存与加权成本回到过账前，并新增一条数量相反的反向流水", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));
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
        quantity: "0.000",
        unitCost: "0.000000",
      },
    ]);
    const movements = await movementsOf(fixture, document.documentNo);
    expect(movements).toHaveLength(2);
    expect(movements[1]?.direction).toBe("REVERSAL");
    expect(movements[1]?.quantityBefore).toBe("12.000");
    expect(movements[1]?.quantityAfter).toBe("0.000");
    expect(movements[1]?.amount).toBe("-13.38");

    await fixture.app.close();
  });

  it("已作废单据再次作废返回 409，已过账单据的修改请求也被拒绝", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/void`,
      headers: { cookie: fixture.cookie },
    });

    const voidAgain = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/void`,
      headers: { cookie: fixture.cookie },
    });
    expect(voidAgain.statusCode).toBe(409);
    expect(voidAgain.json().error.code).toBe("STATE_CONFLICT");

    const update = await fixture.app.inject({
      method: "PUT",
      url: `/api/documents/${document.id}`,
      headers: { cookie: fixture.cookie },
      payload: purchaseInboundBody(fixture),
    });
    expect(update.statusCode).toBe(409);

    await fixture.app.close();
  });

  it("按单据号查库存流水能查到该单的流水，内容与写入时一致", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });

    const movements = await movementsOf(fixture, document.documentNo);

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      documentNo: document.documentNo,
      lineNo: 1,
      warehouseId: fixture.warehouseId,
      itemId: fixture.itemId,
      direction: "POST",
      quantityBefore: "0.000",
      quantityAfter: "12.000",
      costBefore: "0.000000",
      costAfter: "1.115000",
      unitPrice: "1.115000",
      amount: "13.38",
    });

    await fixture.app.close();
  });

  it("处于草稿的单据在库存流水里查不到任何记录", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));

    expect(await movementsOf(fixture, document.documentNo)).toEqual([]);

    await fixture.app.close();
  });

  it("按辅助计量单位「1 箱 = 12 瓶」录入 1 箱并过账后，账面库存增加 12 而不是 1", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(
      fixture,
      purchaseInboundBody(fixture, {
        lines: [
          { itemId: fixture.itemId, quantity: "1", unitPrice: "1.115", amount: null, unit: "箱" },
        ],
      }),
    );

    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });

    expect(await balancesOf(fixture)).toEqual([
      {
        warehouseId: fixture.warehouseId,
        itemId: fixture.itemId,
        quantity: "12.000",
        unitCost: "1.115000",
      },
    ]);

    await fixture.app.close();
  });

  it("已过账单据引用过的商品删除请求被拒并给出明确错误，商品档案仍在列表中", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/post`,
      headers: { cookie: fixture.cookie },
    });

    const rejected = await fixture.app.inject({
      method: "DELETE",
      url: `/api/items/${fixture.itemId}`,
      headers: { cookie: fixture.cookie },
    });

    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("CONFLICT");
    expect(rejected.json().error.message).toContain("已被已过账单据");
    expect(rejected.json().error.message).toContain("不能删除");
    expect(rejected.json().error.message).toContain(document.documentNo);

    const items = await fixture.app.inject({
      method: "GET",
      url: "/api/items",
      headers: { cookie: fixture.cookie },
    });
    expect(
      items.json().data.items.find((item: { id: string }) => item.id === fixture.itemId),
    ).toBeDefined();

    await fixture.app.close();
  });

  it("只被草稿引用的商品仍然可以删除", async () => {
    const fixture = await buildPostingApp();
    await createDocument(
      fixture,
      purchaseInboundBody(fixture, {
        lines: [{ itemId: fixture.draftItemId, quantity: "1", unitPrice: "1.115", amount: null }],
      }),
    );

    const deleted = await fixture.app.inject({
      method: "DELETE",
      url: `/api/items/${fixture.draftItemId}`,
      headers: { cookie: fixture.cookie },
    });

    expect(deleted.statusCode).toBe(200);

    await fixture.app.close();
  });

  it("过账与作废接口都要会话", async () => {
    const fixture = await buildPostingApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));

    for (const url of [
      `/api/documents/${document.id}/post`,
      `/api/documents/${document.id}/void`,
    ]) {
      const response = await fixture.app.inject({ method: "POST", url });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHENTICATED");
    }

    await fixture.app.close();
  });
});
