import { describe, expect, it } from "vitest";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3000";
const defaultAdminUsername = "admin";
const defaultAdminPassword = "admin-dev-password";

let cachedCookie: string | null = null;

async function sessionCookie(): Promise<string> {
  if (cachedCookie !== null) {
    return cachedCookie;
  }
  const response = await fetch(`${apiBaseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: defaultAdminUsername, password: defaultAdminPassword }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) {
    throw new Error("登录响应没有下发 set-cookie");
  }
  cachedCookie = setCookie.split(";")[0] ?? "";
  return cachedCookie;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: any }> {
  const cookie = await sessionCookie();
  const headers: Record<string, string> = { cookie };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text === "" ? undefined : JSON.parse(text),
  };
}

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const createMasterData = async () => {
  const supplier = await api("POST", "/api/suppliers", {
    code: uniqueCode("E2E-TRF-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  });
  const sourceWarehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("E2E-TRF-WH-SRC"),
    name: "杭州总仓",
    purpose: null,
  });
  const targetWarehouse = await api("POST", "/api/warehouses", {
    code: uniqueCode("E2E-TRF-WH-TGT"),
    name: "杭州分仓",
    purpose: null,
  });
  const item = await api("POST", "/api/items", {
    code: uniqueCode("E2E-TRF-SKU"),
    barcode: null,
    name: "可口可乐",
    specification: null,
    brand: null,
    category: null,
    baseUnit: "瓶",
    auxiliaryUnits: [],
  });
  return {
    supplierId: supplier.payload.data.id as string,
    sourceWarehouseId: sourceWarehouse.payload.data.id as string,
    targetWarehouseId: targetWarehouse.payload.data.id as string,
    itemId: item.payload.data.id as string,
  };
};

const seedSourceStock = async (master: Awaited<ReturnType<typeof createMasterData>>) => {
  const inbound = await api("POST", "/api/documents", {
    type: "PURCHASE_INBOUND",
    supplierId: master.supplierId,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: master.sourceWarehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity: "10", unitPrice: "2.5", amount: null }],
  });
  expect(inbound.status).toBe(200);
  const posted = await api("POST", `/api/documents/${inbound.payload.data.id}/post`);
  expect(posted.status).toBe(200);
};

const createTransfer = async (master: Awaited<ReturnType<typeof createMasterData>>) => {
  const transfer = await api("POST", "/api/documents", {
    type: "TRANSFER",
    supplierId: null,
    customerId: null,
    sourceWarehouseId: master.sourceWarehouseId,
    targetWarehouseId: master.targetWarehouseId,
    warehouseId: null,
    lines: [{ itemId: master.itemId, quantity: "4", unitPrice: "2.5", amount: null }],
  });
  expect(transfer.status).toBe(200);
  return transfer.payload.data as { id: string; documentNo: string };
};

const balanceOf = async (
  master: Awaited<ReturnType<typeof createMasterData>>,
  warehouseId: string,
): Promise<{ onHand: string; inTransit: string; unitCost: string } | undefined> => {
  const response = await api(
    "GET",
    `/api/inventory/balances?warehouseId=${warehouseId}&itemId=${master.itemId}`,
  );
  expect(response.status).toBe(200);
  const balances = response.payload.data.balances as Array<{
    onHand: string;
    inTransit: string;
    unitCost: string;
  }>;
  return balances[0];
};

const inTransitOf = async (documentId: string): Promise<Array<Record<string, unknown>>> => {
  const response = await api("GET", `/api/documents/${documentId}/in-transit`);
  expect(response.status).toBe(200);
  return response.payload.data.inTransit as Array<Record<string, unknown>>;
};

const movementsOf = async (documentNo: string): Promise<Array<Record<string, unknown>>> => {
  const response = await api("GET", `/api/inventory/movements?documentNo=${documentNo}`);
  expect(response.status).toBe(200);
  return response.payload.data.movements as Array<Record<string, unknown>>;
};

describe("端到端：调拨与在途", () => {
  it("调出过账后源仓账面减少、在途记录带上数量与成本，库存查询的在途口径等于真实在途", async () => {
    const master = await createMasterData();
    await seedSourceStock(master);
    const document = await createTransfer(master);

    const out = await api("POST", `/api/documents/${document.id}/post`, { phase: "OUT" });

    expect(out.status).toBe(200);
    expect(out.payload.data.status).toBe("POSTED");
    expect(await balanceOf(master, master.sourceWarehouseId)).toMatchObject({
      onHand: "6.000",
      inTransit: "4.000",
      unitCost: "2.500000",
    });
    expect(await inTransitOf(document.id)).toMatchObject([
      {
        lineNo: 1,
        itemId: master.itemId,
        sourceWarehouseId: master.sourceWarehouseId,
        targetWarehouseId: master.targetWarehouseId,
        quantity: "4.000",
        unitCost: "2.500000",
        status: "IN_TRANSIT",
      },
    ]);
    const movements = await movementsOf(document.documentNo);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.amount).toBe("10.00");
  });

  it("调入过账后目标仓账面增加、这批数量不再计入在途", async () => {
    const master = await createMasterData();
    await seedSourceStock(master);
    const document = await createTransfer(master);
    await api("POST", `/api/documents/${document.id}/post`, { phase: "OUT" });

    const into = await api("POST", `/api/documents/${document.id}/post`, { phase: "IN" });

    expect(into.status).toBe(200);
    expect(await balanceOf(master, master.targetWarehouseId)).toMatchObject({
      onHand: "4.000",
      inTransit: "0.000",
      unitCost: "2.500000",
    });
    expect((await inTransitOf(document.id))[0]?.quantity).toBe("0.000");
    expect(await movementsOf(document.documentNo)).toHaveLength(2);
  });

  it("调入过账时成本随货并入目标仓：目标仓原有库存按加权规则重算成本", async () => {
    const master = await createMasterData();
    await seedSourceStock(master);
    const targetInbound = await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.targetWarehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "10", unitPrice: "4", amount: null }],
    });
    expect(targetInbound.status).toBe(200);
    const targetPosted = await api("POST", `/api/documents/${targetInbound.payload.data.id}/post`);
    expect(targetPosted.status).toBe(200);
    const document = await createTransfer(master);
    await api("POST", `/api/documents/${document.id}/post`, { phase: "OUT" });

    const into = await api("POST", `/api/documents/${document.id}/post`, { phase: "IN" });

    expect(into.status).toBe(200);
    expect(await balanceOf(master, master.targetWarehouseId)).toMatchObject({
      onHand: "14.000",
      inTransit: "0.000",
      unitCost: "3.571429",
    });
    const movements = await movementsOf(document.documentNo);
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({
      quantityBefore: "10.000",
      quantityAfter: "14.000",
      unitPrice: "2.500000",
      amount: "10.00",
    });
  });

  it("未调出过账就发起调入过账的请求被拒绝，错误消息指出该调拨单尚未调出", async () => {
    const master = await createMasterData();
    await seedSourceStock(master);
    const document = await createTransfer(master);

    const into = await api("POST", `/api/documents/${document.id}/post`, { phase: "IN" });

    expect(into.status).toBe(400);
    expect(into.payload.error.message).toContain("尚未调出");
  });

  it("调出过账会使源仓账面库存变负时整单调出过账失败，失败后源仓库存与流水都不变化", async () => {
    const master = await createMasterData();
    const inbound = await api("POST", "/api/documents", {
      type: "PURCHASE_INBOUND",
      supplierId: master.supplierId,
      customerId: null,
      sourceWarehouseId: null,
      targetWarehouseId: master.sourceWarehouseId,
      warehouseId: null,
      lines: [{ itemId: master.itemId, quantity: "3", unitPrice: "2.5", amount: null }],
    });
    await api("POST", `/api/documents/${inbound.payload.data.id}/post`);
    const document = await createTransfer(master);

    const out = await api("POST", `/api/documents/${document.id}/post`, { phase: "OUT" });

    expect(out.status).toBe(409);
    expect(out.payload.error.code).toBe("STOCK_NEGATIVE");
    expect(out.payload.error.message).toContain("-1.000");
    expect((await balanceOf(master, master.sourceWarehouseId))?.onHand).toBe("3.000");
    expect(await movementsOf(document.documentNo)).toEqual([]);
  });

  it("同一阶段重复过账幂等短路，不同阶段各能过账一次", async () => {
    const master = await createMasterData();
    await seedSourceStock(master);
    const document = await createTransfer(master);

    await api("POST", `/api/documents/${document.id}/post`, { phase: "OUT" });
    const repeated = await api("POST", `/api/documents/${document.id}/post`, { phase: "OUT" });
    const into = await api("POST", `/api/documents/${document.id}/post`, { phase: "IN" });

    expect(repeated.status).toBe(200);
    expect(into.status).toBe(200);
    expect((await balanceOf(master, master.sourceWarehouseId))?.onHand).toBe("6.000");
    expect((await balanceOf(master, master.targetWarehouseId))?.onHand).toBe("4.000");
    expect(await movementsOf(document.documentNo)).toHaveLength(2);
  });

  it("作废只调出过账的调拨单：货回源仓、在途归零、流水追加一条反向流水", async () => {
    const master = await createMasterData();
    await seedSourceStock(master);
    const document = await createTransfer(master);
    await api("POST", `/api/documents/${document.id}/post`, { phase: "OUT" });

    const voided = await api("POST", `/api/documents/${document.id}/void`);

    expect(voided.status).toBe(200);
    expect(voided.payload.data.status).toBe("VOIDED");
    expect((await balanceOf(master, master.sourceWarehouseId))?.onHand).toBe("10.000");
    expect(await inTransitOf(document.id)).toEqual([]);
    const movements = await movementsOf(document.documentNo);
    expect(movements).toHaveLength(2);
    expect(movements[1]?.direction).toBe("REVERSAL");
  });

  it("作废两段都过账的调拨单：源仓恢复、目标仓扣回、在途归零、流水追加两条反向流水", async () => {
    const master = await createMasterData();
    await seedSourceStock(master);
    const document = await createTransfer(master);
    await api("POST", `/api/documents/${document.id}/post`, { phase: "OUT" });
    await api("POST", `/api/documents/${document.id}/post`, { phase: "IN" });

    const voided = await api("POST", `/api/documents/${document.id}/void`);

    expect(voided.status).toBe(200);
    expect((await balanceOf(master, master.sourceWarehouseId))?.onHand).toBe("10.000");
    expect((await balanceOf(master, master.targetWarehouseId))?.onHand).toBe("0.000");
    expect(await inTransitOf(document.id)).toEqual([]);
    const movements = await movementsOf(document.documentNo);
    expect(movements).toHaveLength(4);
    expect(movements.filter((movement) => movement.direction === "REVERSAL")).toHaveLength(2);
  });
});
