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

type PurchaseReturnApp = {
  app: FastifyInstance;
  cookie: string;
  customerId: string;
  warehouseId: string;
  otherWarehouseId: string;
  itemId: string;
  inboundId: string;
  inboundLineId: string;
};

const buildPurchaseReturnApp = async (): Promise<PurchaseReturnApp> => {
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
    code: "SUP-PRET-001",
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const customerId = await created("/api/customers", {
    code: "CUS-PRET-001",
    name: "杭州百货大楼",
    contact: null,
  });
  const warehouseId = await created("/api/warehouses", {
    code: "WH-PRET-001",
    name: "杭州总仓",
    purpose: null,
  });
  const otherWarehouseId = await created("/api/warehouses", {
    code: "WH-PRET-002",
    name: "杭州分仓",
    purpose: null,
  });
  const itemId = await created("/api/items", {
    code: "SKU-PRET-001",
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
      lines: [{ itemId, quantity: "10", unitPrice: "2", amount: null }],
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
  const inboundLineId = inbound.json().data.lines[0].id as string;

  return {
    app,
    cookie,
    customerId,
    warehouseId,
    otherWarehouseId,
    itemId,
    inboundId,
    inboundLineId,
  };
};

const purchaseReturnBody = (
  fixture: PurchaseReturnApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "PURCHASE_RETURN",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: null,
  warehouseId: null,
  lines: [
    {
      itemId: fixture.itemId,
      quantity: "4",
      unitPrice: null,
      amount: null,
      originalLineId: fixture.inboundLineId,
    },
  ],
  ...overrides,
});

const createReturn = async (fixture: PurchaseReturnApp, body: Record<string, unknown>) =>
  fixture.app.inject({
    method: "POST",
    url: "/api/documents",
    headers: { cookie: fixture.cookie },
    payload: body,
  });

const balancesOf = async (fixture: PurchaseReturnApp) => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/balances?warehouseId=${fixture.warehouseId}&itemId=${fixture.itemId}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.balances as Array<{ onHand: string; unitCost: string }>;
};

const movementsOf = async (fixture: PurchaseReturnApp, documentNo: string) => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/movements?documentNo=${documentNo}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.movements as Array<Record<string, unknown>>;
};

describe("采购退货的 HTTP 表面", () => {
  it("新建采购退货单时仓库自动取原采购入库单的目标仓，行上带回原单据行引用", async () => {
    const fixture = await buildPurchaseReturnApp();

    const response = await createReturn(fixture, purchaseReturnBody(fixture));

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("DRAFT");
    expect(response.json().data.type).toBe("PURCHASE_RETURN");
    expect(response.json().data.documentNo).toMatch(/^PRET-\d{8}-\d{3}$/);
    expect(response.json().data.sourceWarehouseId).toBe(fixture.warehouseId);
    expect(response.json().data.lines[0].originalLineId).toBe(fixture.inboundLineId);
    expect(response.json().data.lines[0].quantity).toBe("4.000");

    await fixture.app.close();
  });

  it("提交与原单不同的仓库值时保存失败，错误消息指出仓库必须取自原单据", async () => {
    const fixture = await buildPurchaseReturnApp();

    const response = await createReturn(
      fixture,
      purchaseReturnBody(fixture, { sourceWarehouseId: fixture.otherWarehouseId }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION");
    expect(response.json().error.message).toContain("仓库必须取自原单据");

    await fixture.app.close();
  });

  it("不给出原单据行引用或引用不存在的行时保存失败，错误消息指出原单据行", async () => {
    const fixture = await buildPurchaseReturnApp();

    const missing = await createReturn(
      fixture,
      purchaseReturnBody(fixture, {
        lines: [{ itemId: fixture.itemId, quantity: "4", unitPrice: null, amount: null }],
      }),
    );
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.message).toContain("缺少原单据行引用");

    const unknown = await createReturn(
      fixture,
      purchaseReturnBody(fixture, {
        lines: [
          {
            itemId: fixture.itemId,
            quantity: "4",
            unitPrice: null,
            amount: null,
            originalLineId: "missing-line-id",
          },
        ],
      }),
    );
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.message).toContain("原单据行不存在");

    await fixture.app.close();
  });

  it("引用销售出库单的行时保存失败，错误消息指出原单据行不属于采购入库单", async () => {
    const fixture = await buildPurchaseReturnApp();
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
        lines: [{ itemId: fixture.itemId, quantity: "2", unitPrice: "3.5", amount: null }],
      },
    });
    expect(outbound.statusCode).toBe(200);

    const response = await createReturn(
      fixture,
      purchaseReturnBody(fixture, {
        lines: [
          {
            itemId: fixture.itemId,
            quantity: "4",
            unitPrice: null,
            amount: null,
            originalLineId: outbound.json().data.lines[0].id as string,
          },
        ],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("不属于采购入库单");

    await fixture.app.close();
  });

  it("过账后目标仓账面库存减少退货数量，流水记录按当前加权平均成本结转的金额", async () => {
    const fixture = await buildPurchaseReturnApp();
    const created = await createReturn(fixture, purchaseReturnBody(fixture));
    const documentId = created.json().data.id as string;
    const documentNo = created.json().data.documentNo as string;

    const posted = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${documentId}/post`,
      headers: { cookie: fixture.cookie },
    });

    expect(posted.statusCode).toBe(200);
    expect(posted.json().data.status).toBe("POSTED");
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "6.000", unitCost: "2.000000" }]);
    const movements = await movementsOf(fixture, documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      direction: "POST",
      quantityBefore: "10.000",
      quantityAfter: "6.000",
      unitPrice: "2.000000",
      amount: "8.00",
    });

    await fixture.app.close();
  });

  it("累计退货数量超过原行已过账数量时过账失败并报出超退的数量", async () => {
    const fixture = await buildPurchaseReturnApp();
    const first = await createReturn(
      fixture,
      purchaseReturnBody(fixture, {
        lines: [
          {
            itemId: fixture.itemId,
            quantity: "6",
            unitPrice: null,
            amount: null,
            originalLineId: fixture.inboundLineId,
          },
        ],
      }),
    );
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${first.json().data.id as string}/post`,
      headers: { cookie: fixture.cookie },
    });
    const second = await createReturn(
      fixture,
      purchaseReturnBody(fixture, {
        lines: [
          {
            itemId: fixture.itemId,
            quantity: "3",
            unitPrice: null,
            amount: null,
            originalLineId: fixture.inboundLineId,
          },
        ],
      }),
    );
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${second.json().data.id as string}/post`,
      headers: { cookie: fixture.cookie },
    });
    const third = await createReturn(
      fixture,
      purchaseReturnBody(fixture, {
        lines: [
          {
            itemId: fixture.itemId,
            quantity: "2",
            unitPrice: null,
            amount: null,
            originalLineId: fixture.inboundLineId,
          },
        ],
      }),
    );

    const posted = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${third.json().data.id as string}/post`,
      headers: { cookie: fixture.cookie },
    });

    expect(posted.statusCode).toBe(400);
    expect(posted.json().error.code).toBe("VALIDATION");
    expect(posted.json().error.message).toContain("超退 1.000");
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "1.000", unitCost: "2.000000" }]);

    await fixture.app.close();
  });

  it("退货会让账面库存变负时过账失败，库存与库存流水都不发生变化", async () => {
    const fixture = await buildPurchaseReturnApp();
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
        lines: [{ itemId: fixture.itemId, quantity: "7", unitPrice: "3.5", amount: null }],
      },
    });
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${outbound.json().data.id as string}/post`,
      headers: { cookie: fixture.cookie },
    });
    const created = await createReturn(fixture, purchaseReturnBody(fixture));

    const posted = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${created.json().data.id as string}/post`,
      headers: { cookie: fixture.cookie },
    });

    expect(posted.statusCode).toBe(409);
    expect(posted.json().error.code).toBe("STOCK_NEGATIVE");
    expect(posted.json().error.message).toContain("禁止负库存");
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "3.000", unitCost: "2.000000" }]);
    expect(await movementsOf(fixture, created.json().data.documentNo as string)).toEqual([]);

    await fixture.app.close();
  });

  it("作废后账面库存回到退货前，并追加一条金额相反的反向流水", async () => {
    const fixture = await buildPurchaseReturnApp();
    const created = await createReturn(fixture, purchaseReturnBody(fixture));
    const documentId = created.json().data.id as string;
    const documentNo = created.json().data.documentNo as string;
    await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${documentId}/post`,
      headers: { cookie: fixture.cookie },
    });

    const voided = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${documentId}/void`,
      headers: { cookie: fixture.cookie },
    });

    expect(voided.statusCode).toBe(200);
    expect(voided.json().data.status).toBe("VOIDED");
    expect(await balancesOf(fixture)).toMatchObject([{ onHand: "10.000", unitCost: "2.000000" }]);
    const movements = await movementsOf(fixture, documentNo);
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({
      direction: "REVERSAL",
      quantityBefore: "6.000",
      quantityAfter: "10.000",
      amount: "-8.00",
    });

    await fixture.app.close();
  });
});
