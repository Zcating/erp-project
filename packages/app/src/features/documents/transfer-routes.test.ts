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

type TransferApp = {
  app: FastifyInstance;
  cookie: string;
  supplierId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  itemId: string;
};

const buildTransferApp = async (): Promise<TransferApp> => {
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
    code: "SUP-TRF-001",
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const sourceWarehouseId = await created("/api/warehouses", {
    code: "WH-TRF-001",
    name: "杭州总仓",
    purpose: null,
  });
  const targetWarehouseId = await created("/api/warehouses", {
    code: "WH-TRF-002",
    name: "杭州分仓",
    purpose: null,
  });
  const itemId = await created("/api/items", {
    code: "SKU-TRF-001",
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  });

  return { app, cookie, supplierId, sourceWarehouseId, targetWarehouseId, itemId };
};

const createDocument = async (
  fixture: TransferApp,
  body: Record<string, unknown>,
): Promise<{ id: string; documentNo: string; status: string }> => {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/documents",
    headers: { cookie: fixture.cookie },
    payload: body,
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as { id: string; documentNo: string; status: string };
};

const postPhase = async (
  fixture: TransferApp,
  documentId: string,
  phase: string,
): Promise<{ statusCode: number; body: any }> => {
  const response = await fixture.app.inject({
    method: "POST",
    url: `/api/documents/${documentId}/post`,
    headers: { cookie: fixture.cookie },
    payload: { phase },
  });
  return { statusCode: response.statusCode, body: response.json() };
};

const balanceOf = async (
  fixture: TransferApp,
  warehouseId: string,
): Promise<{ onHand: string; inTransit: string; unitCost: string } | undefined> => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/inventory/balances?warehouseId=${warehouseId}&itemId=${fixture.itemId}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  const balances = response.json().data.balances as Array<{
    onHand: string;
    inTransit: string;
    unitCost: string;
  }>;
  return balances[0];
};
const inTransitOf = async (
  fixture: TransferApp,
  documentId: string,
): Promise<Array<Record<string, unknown>>> => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/documents/${documentId}/in-transit`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.inTransit as Array<Record<string, unknown>>;
};

const transferBody = (fixture: TransferApp, quantity = "4"): Record<string, unknown> => ({
  type: "TRANSFER",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: fixture.sourceWarehouseId,
  targetWarehouseId: fixture.targetWarehouseId,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity, unitPrice: "2.5", amount: null }],
});

const seedSourceStock = async (fixture: TransferApp, quantity = "10"): Promise<void> => {
  const inbound = await createDocument(fixture, {
    type: "PURCHASE_INBOUND",
    supplierId: fixture.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: fixture.sourceWarehouseId,
    warehouseId: null,
    lines: [{ itemId: fixture.itemId, quantity, unitPrice: "2.5", amount: null }],
  });
  const posted = await fixture.app.inject({
    method: "POST",
    url: `/api/documents/${inbound.id}/post`,
    headers: { cookie: fixture.cookie },
  });
  expect(posted.statusCode).toBe(200);
};

describe("调拨的 HTTP 表面", () => {
  it("调出过账后源仓账面减少、在途视图能查到这批在途的数量与成本，库存查询的在途口径等于真实在途", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture);
    const document = await createDocument(fixture, transferBody(fixture));

    const out = await postPhase(fixture, document.id, "OUT");

    expect(out.statusCode).toBe(200);
    expect(out.body.data.status).toBe("POSTED");
    expect(await balanceOf(fixture, fixture.sourceWarehouseId)).toMatchObject({
      onHand: "6.000",
      inTransit: "4.000",
      unitCost: "2.500000",
    });
    expect(await inTransitOf(fixture, document.id)).toEqual([
      {
        id: expect.any(String),
        documentId: document.id,
        documentNo: document.documentNo,
        lineNo: 1,
        itemId: fixture.itemId,
        sourceWarehouseId: fixture.sourceWarehouseId,
        targetWarehouseId: fixture.targetWarehouseId,
        quantity: "4.000",
        unitCost: "2.500000",
        status: "IN_TRANSIT",
      },
    ]);

    await fixture.app.close();
  });

  it("调入过账后目标仓账面增加、这批数量不再计入在途，该调拨单的在途数量归零", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture);
    const document = await createDocument(fixture, transferBody(fixture));
    await postPhase(fixture, document.id, "OUT");

    const into = await postPhase(fixture, document.id, "IN");

    expect(into.statusCode).toBe(200);
    expect(into.body.data.status).toBe("POSTED");
    expect(await balanceOf(fixture, fixture.targetWarehouseId)).toMatchObject({
      onHand: "4.000",
      inTransit: "0.000",
      unitCost: "2.500000",
    });
    expect((await inTransitOf(fixture, document.id))[0]?.quantity).toBe("0.000");

    await fixture.app.close();
  });

  it("未调出过账就发起调入过账的请求被拒绝，错误消息指出该调拨单尚未调出", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture);
    const document = await createDocument(fixture, transferBody(fixture));

    const into = await postPhase(fixture, document.id, "IN");

    expect(into.statusCode).toBe(400);
    expect(into.body.error.code).toBe("VALIDATION");
    expect(into.body.error.message).toContain("尚未调出");

    await fixture.app.close();
  });

  it("调出过账会使源仓账面库存变负时整单调出过账失败，失败后源仓库存与流水都不变化，错误消息报出将变为负数的数量", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture, "3");
    const document = await createDocument(fixture, transferBody(fixture));

    const out = await postPhase(fixture, document.id, "OUT");

    expect(out.statusCode).toBe(409);
    expect(out.body.error.code).toBe("STOCK_NEGATIVE");
    expect(out.body.error.message).toContain("-1.000");
    expect((await balanceOf(fixture, fixture.sourceWarehouseId))?.onHand).toBe("3.000");
    const movements = await fixture.app.inject({
      method: "GET",
      url: `/api/inventory/movements?documentNo=${document.documentNo}`,
      headers: { cookie: fixture.cookie },
    });
    expect(movements.json().data.movements).toEqual([]);

    await fixture.app.close();
  });

  it("同一阶段重复过账幂等短路：第二次调出不产生第二次库存影响，不同阶段各能过账一次", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture);
    const document = await createDocument(fixture, transferBody(fixture));

    await postPhase(fixture, document.id, "OUT");
    const repeated = await postPhase(fixture, document.id, "OUT");
    const into = await postPhase(fixture, document.id, "IN");

    expect(repeated.statusCode).toBe(200);
    expect(into.statusCode).toBe(200);
    expect((await balanceOf(fixture, fixture.sourceWarehouseId))?.onHand).toBe("6.000");
    expect((await balanceOf(fixture, fixture.targetWarehouseId))?.onHand).toBe("4.000");
    const movements = await fixture.app.inject({
      method: "GET",
      url: `/api/inventory/movements?documentNo=${document.documentNo}`,
      headers: { cookie: fixture.cookie },
    });
    expect(movements.json().data.movements).toHaveLength(2);

    await fixture.app.close();
  });

  it("作废只调出过账的调拨单：货回源仓、在途归零、流水追加一条反向流水", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture);
    const document = await createDocument(fixture, transferBody(fixture));
    await postPhase(fixture, document.id, "OUT");

    const voided = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/void`,
      headers: { cookie: fixture.cookie },
    });

    expect(voided.statusCode).toBe(200);
    expect(voided.json().data.status).toBe("VOIDED");
    expect((await balanceOf(fixture, fixture.sourceWarehouseId))?.onHand).toBe("10.000");
    expect(await inTransitOf(fixture, document.id)).toEqual([]);
    const movements = await fixture.app.inject({
      method: "GET",
      url: `/api/inventory/movements?documentNo=${document.documentNo}`,
      headers: { cookie: fixture.cookie },
    });
    expect(movements.json().data.movements).toHaveLength(2);
    expect(movements.json().data.movements[1].direction).toBe("REVERSAL");

    await fixture.app.close();
  });

  it("作废两段都过账的调拨单：源仓恢复、目标仓扣回、在途归零、流水追加两条反向流水", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture);
    const document = await createDocument(fixture, transferBody(fixture));
    await postPhase(fixture, document.id, "OUT");
    await postPhase(fixture, document.id, "IN");

    const voided = await fixture.app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/void`,
      headers: { cookie: fixture.cookie },
    });

    expect(voided.statusCode).toBe(200);
    expect((await balanceOf(fixture, fixture.sourceWarehouseId))?.onHand).toBe("10.000");
    expect((await balanceOf(fixture, fixture.targetWarehouseId))?.onHand).toBe("0.000");
    expect(await inTransitOf(fixture, document.id)).toEqual([]);
    const movements = await fixture.app.inject({
      method: "GET",
      url: `/api/inventory/movements?documentNo=${document.documentNo}`,
      headers: { cookie: fixture.cookie },
    });
    const reversals = (movements.json().data.movements as Array<{ direction: string }>).filter(
      (movement) => movement.direction === "REVERSAL",
    );
    expect(reversals).toHaveLength(2);

    await fixture.app.close();
  });

  it("调拨单的列表与详情带出已过账阶段，供界面判断两个过账动作是否可用", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture);
    const document = await createDocument(fixture, transferBody(fixture));

    const listed = await fixture.app.inject({
      method: "GET",
      url: "/api/documents?type=TRANSFER",
      headers: { cookie: fixture.cookie },
    });
    const rows = listed.json().data.documents as Array<{ id: string; postedPhases?: string[] }>;
    expect(rows.find((row) => row.id === document.id)?.postedPhases).toEqual([]);

    await postPhase(fixture, document.id, "OUT");
    const afterOut = await fixture.app.inject({
      method: "GET",
      url: `/api/documents/${document.id}`,
      headers: { cookie: fixture.cookie },
    });
    expect(afterOut.json().data.postedPhases).toEqual(["OUT"]);

    await postPhase(fixture, document.id, "IN");
    const afterIn = await fixture.app.inject({
      method: "GET",
      url: `/api/documents/${document.id}`,
      headers: { cookie: fixture.cookie },
    });
    expect(afterIn.json().data.postedPhases).toEqual(["OUT", "IN"]);

    await fixture.app.close();
  });

  it("过账与在途视图接口都要会话", async () => {
    const fixture = await buildTransferApp();
    await seedSourceStock(fixture);
    const document = await createDocument(fixture, transferBody(fixture));

    for (const [method, url] of [
      ["POST", `/api/documents/${document.id}/post`],
      ["POST", `/api/documents/${document.id}/void`],
      ["GET", `/api/documents/${document.id}/in-transit`],
    ] as const) {
      const response = await fixture.app.inject({ method, url });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHENTICATED");
    }

    await fixture.app.close();
  });
});
