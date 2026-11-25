import {
  availableDocumentActions,
  createInMemoryCustomerRepository,
  createInMemoryDocumentRepository,
  createInMemoryItemMasterRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
} from "@erp-project/kernel";
import type { Document } from "@erp-project/kernel";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../build-app";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from "../session";

type ActionsApp = {
  app: FastifyInstance;
  cookie: string;
  supplierId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  itemId: string;
};

type DocumentView = Document & {
  postedPhases?: string[];
  actions: ReturnType<typeof availableDocumentActions>;
};

const buildActionsApp = async (): Promise<ActionsApp> => {
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
    code: "SUP-ACT-001",
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const sourceWarehouseId = await created("/api/warehouses", {
    code: "WH-ACT-001",
    name: "杭州总仓",
    purpose: null,
  });
  const targetWarehouseId = await created("/api/warehouses", {
    code: "WH-ACT-002",
    name: "杭州分仓",
    purpose: null,
  });
  const itemId = await created("/api/items", {
    code: "SKU-ACT-001",
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

const purchaseInboundBody = (
  fixture: ActionsApp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  type: "PURCHASE_INBOUND",
  supplierId: fixture.supplierId,
  customerId: null,
  sourceWarehouseId: null,
  targetWarehouseId: fixture.sourceWarehouseId,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity: "10", unitPrice: "2.5", amount: null }],
  ...overrides,
});

const transferBody = (fixture: ActionsApp): Record<string, unknown> => ({
  type: "TRANSFER",
  supplierId: null,
  customerId: null,
  sourceWarehouseId: fixture.sourceWarehouseId,
  targetWarehouseId: fixture.targetWarehouseId,
  warehouseId: null,
  lines: [{ itemId: fixture.itemId, quantity: "4", unitPrice: "2.5", amount: null }],
});

const createDocument = async (
  fixture: ActionsApp,
  body: Record<string, unknown>,
): Promise<DocumentView> => {
  const response = await fixture.app.inject({
    method: "POST",
    url: "/api/documents",
    headers: { cookie: fixture.cookie },
    payload: body,
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as DocumentView;
};

const postDocument = async (
  fixture: ActionsApp,
  documentId: string,
  phase?: string,
): Promise<void> => {
  const response = await fixture.app.inject({
    method: "POST",
    url: `/api/documents/${documentId}/post`,
    headers: { cookie: fixture.cookie },
    payload: phase === undefined ? {} : { phase },
  });
  expect(response.statusCode).toBe(200);
};

const readDocument = async (fixture: ActionsApp, documentId: string): Promise<DocumentView> => {
  const response = await fixture.app.inject({
    method: "GET",
    url: `/api/documents/${documentId}`,
    headers: { cookie: fixture.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as DocumentView;
};

describe("服务端下发的可用动作", () => {
  it("单据详情带上下发的可用动作，取值与内核纯函数一致", async () => {
    const fixture = await buildActionsApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));

    const view = await readDocument(fixture, document.id);

    expect(view.actions).toEqual(availableDocumentActions(view, view.postedPhases ?? []));
    expect(view.actions).toEqual({
      post: [{ phase: null, label: "过账", enabled: true, reason: null }],
      void: { label: "作废", enabled: false, reason: "单据尚未过账，不能作废" },
    });

    await fixture.app.close();
  });

  it("单据列表里的每一张单都带上下发的可用动作", async () => {
    const fixture = await buildActionsApp();
    await createDocument(fixture, purchaseInboundBody(fixture));
    await createDocument(fixture, transferBody(fixture));

    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/documents",
      headers: { cookie: fixture.cookie },
    });
    expect(response.statusCode).toBe(200);
    const views = response.json().data.documents as DocumentView[];

    expect(views).toHaveLength(2);
    for (const view of views) {
      expect(view.actions).toEqual(availableDocumentActions(view, view.postedPhases ?? []));
    }

    await fixture.app.close();
  });

  it("已过账单据的通用过账不可用、通用作废可用", async () => {
    const fixture = await buildActionsApp();
    const document = await createDocument(fixture, purchaseInboundBody(fixture));
    await postDocument(fixture, document.id);

    const view = await readDocument(fixture, document.id);

    expect(view.actions).toEqual({
      post: [{ phase: null, label: "过账", enabled: false, reason: "单据已过账，不能再次过账" }],
      void: { label: "作废", enabled: true, reason: null },
    });

    await fixture.app.close();
  });

  it("调拨单下发调出与调入两条过账动作，调出过账后调入过账变为可用", async () => {
    const fixture = await buildActionsApp();
    const inbound = await createDocument(fixture, purchaseInboundBody(fixture));
    await postDocument(fixture, inbound.id);
    const document = await createDocument(fixture, transferBody(fixture));

    const draft = await readDocument(fixture, document.id);
    expect(draft.actions.post).toEqual([
      { phase: "OUT", label: "调出过账", enabled: true, reason: null },
      {
        phase: "IN",
        label: "调入过账",
        enabled: false,
        reason: "调出阶段尚未完成，不能调入过账",
      },
    ]);

    await postDocument(fixture, document.id, "OUT");
    const afterOut = await readDocument(fixture, document.id);

    expect(afterOut.postedPhases).toEqual(["OUT"]);
    expect(afterOut.actions.post).toEqual([
      { phase: "OUT", label: "调出过账", enabled: false, reason: "调出阶段已完成" },
      { phase: "IN", label: "调入过账", enabled: true, reason: null },
    ]);
    expect(afterOut.actions.void).toEqual({ label: "作废", enabled: true, reason: null });

    await fixture.app.close();
  });

  it("可作为原单据候选的单据只返回已过账的单据", async () => {
    const fixture = await buildActionsApp();
    const posted = await createDocument(fixture, purchaseInboundBody(fixture));
    await postDocument(fixture, posted.id);
    const draft = await createDocument(fixture, purchaseInboundBody(fixture));
    const transfer = await createDocument(fixture, transferBody(fixture));

    const response = await fixture.app.inject({
      method: "GET",
      url: "/api/documents/original-candidates?type=PURCHASE_INBOUND",
      headers: { cookie: fixture.cookie },
    });
    expect(response.statusCode).toBe(200);
    const views = response.json().data.documents as DocumentView[];

    expect(views.map((view) => view.id)).toEqual([posted.id]);
    expect(views[0]?.status).toBe("POSTED");
    expect(views.find((view) => view.id === draft.id)).toBeUndefined();
    expect(views.find((view) => view.id === transfer.id)).toBeUndefined();
    expect(views[0]?.actions).toEqual(availableDocumentActions(views[0] as DocumentView, []));

    await fixture.app.close();
  });

  it("候选来源缺原单据类型或类型未知时返回 400", async () => {
    const fixture = await buildActionsApp();

    const missing = await fixture.app.inject({
      method: "GET",
      url: "/api/documents/original-candidates",
      headers: { cookie: fixture.cookie },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.message).toBe("缺少原单据类型");

    const unknown = await fixture.app.inject({
      method: "GET",
      url: "/api/documents/original-candidates?type=NOT_A_TYPE",
      headers: { cookie: fixture.cookie },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.message).toBe("未知单据类型：NOT_A_TYPE");

    await fixture.app.close();
  });
});
