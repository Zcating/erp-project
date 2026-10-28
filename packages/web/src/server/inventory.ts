import { createServerFn } from "@tanstack/react-start";
import { fetchApi } from "./client";
import { UnauthenticatedError } from "./errors";

export type StockBalanceSummary = {
  warehouseId: string;
  itemId: string;
  onHand: string;
  available: string;
  inTransit: string;
  unitCost: string;
};

export type StockMovement = {
  documentId: string;
  documentNo: string;
  lineNo: number;
  warehouseId: string;
  itemId: string;
  direction: "POST" | "REVERSAL";
  quantityBefore: string;
  quantityAfter: string;
  costBefore: string;
  costAfter: string;
  unitPrice: string;
  amount: string;
  occurredAt: string;
};

export type StockMovementQuery = {
  documentNo: string;
  warehouseId: string;
  itemId: string;
  lineNo: string;
  from: string;
  to: string;
  order: "asc" | "desc";
};

export const listStockBalances = createServerFn({ method: "GET" })
  .validator((data: { warehouseId: string; itemId: string }) => ({
    warehouseId: data.warehouseId,
    itemId: data.itemId,
  }))
  .handler(async ({ data }): Promise<StockBalanceSummary[]> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const query = new URLSearchParams();
    if (data.warehouseId !== "") {
      query.set("warehouseId", data.warehouseId);
    }
    if (data.itemId !== "") {
      query.set("itemId", data.itemId);
    }
    const suffix = query.toString();
    const response = await fetchApi(
      `/api/inventory/balances${suffix === "" ? "" : `?${suffix}`}`,
      getRequestHeader("cookie"),
    );
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/inventory/balances 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { balances: StockBalanceSummary[] } };
    return payload.data.balances;
  });

export const listStockMovements = createServerFn({ method: "GET" })
  .validator((data: StockMovementQuery) => data)
  .handler(async ({ data }): Promise<StockMovement[]> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const query = new URLSearchParams();
    if (data.documentNo !== "") {
      query.set("documentNo", data.documentNo);
    }
    if (data.warehouseId !== "") {
      query.set("warehouseId", data.warehouseId);
    }
    if (data.itemId !== "") {
      query.set("itemId", data.itemId);
    }
    if (data.lineNo !== "") {
      query.set("lineNo", data.lineNo);
    }
    if (data.from !== "") {
      query.set("from", data.from);
    }
    if (data.to !== "") {
      query.set("to", data.to);
    }
    query.set("order", data.order);
    const suffix = query.toString();
    const response = await fetchApi(
      `/api/inventory/movements${suffix === "" ? "" : `?${suffix}`}`,
      getRequestHeader("cookie"),
    );
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/inventory/movements 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { movements: StockMovement[] } };
    return payload.data.movements;
  });
