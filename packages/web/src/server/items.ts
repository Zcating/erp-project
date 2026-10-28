import { createServerFn } from "@tanstack/react-start";
import { fetchApi } from "./client";
import { UnauthenticatedError } from "./errors";
import { readErrorBody } from "./http";

export type ItemAuxiliaryUnit = {
  unit: string;
  conversionRate: string;
};

export type ItemMaster = {
  id: string;
  code: string;
  barcode: string | null;
  name: string;
  specification: string | null;
  brand: string | null;
  category: string | null;
  baseUnit: string;
  auxiliaryUnits: ItemAuxiliaryUnit[];
};

export type ItemInput = {
  code: string;
  barcode: string | null;
  name: string;
  specification: string | null;
  brand: string | null;
  category: string | null;
  baseUnit: string;
  auxiliaryUnits: ItemAuxiliaryUnit[];
};

export type ItemFailure = { ok: false; code: string; message: string };

export type ItemMutationResult = { ok: true; item: ItemMaster } | ItemFailure;

export type ItemLookupResult = { ok: true; item: ItemMaster } | ItemFailure;

export type ItemDeleteResult = { ok: true } | ItemFailure;

export const listItems = createServerFn({ method: "GET" }).handler(
  async (): Promise<ItemMaster[]> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/items", getRequestHeader("cookie"));
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/items 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { items: ItemMaster[] } };
    return payload.data.items;
  },
);

export const getItem = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => ({ id: data.id }))
  .handler(async ({ data }): Promise<ItemMaster> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/items/${data.id}`, getRequestHeader("cookie"));
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/items/${data.id} 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: ItemMaster };
    return payload.data;
  });

export const findItemByBarcode = createServerFn({ method: "GET" })
  .validator((data: { barcode: string }) => ({ barcode: data.barcode }))
  .handler(async ({ data }): Promise<ItemLookupResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(
      `/api/items/by-barcode/${encodeURIComponent(data.barcode)}`,
      getRequestHeader("cookie"),
    );
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (response.status === 404) {
      const body = await readErrorBody(response);
      return { ok: false, code: body.code, message: body.message };
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/items/by-barcode 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: ItemMaster };
    return { ok: true, item: payload.data };
  });

export const createItem = createServerFn({ method: "POST" })
  .validator((data: ItemInput) => data)
  .handler(async ({ data }): Promise<ItemMutationResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/items", getRequestHeader("cookie"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    return readMutationResult(response);
  });

export const updateItem = createServerFn({ method: "POST" })
  .validator((data: { id: string; input: ItemInput }) => data)
  .handler(async ({ data }): Promise<ItemMutationResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/items/${data.id}`, getRequestHeader("cookie"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data.input),
    });
    return readMutationResult(response);
  });

export const deleteItem = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<ItemDeleteResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi(`/api/items/${data.id}`, getRequestHeader("cookie"), {
      method: "DELETE",
    });
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      const body = await readErrorBody(response);
      return { ok: false, code: body.code, message: body.message };
    }
    return { ok: true };
  });

async function readMutationResult(response: Response): Promise<ItemMutationResult> {
  if (response.status === 401) {
    throw new UnauthenticatedError();
  }
  if (!response.ok) {
    const body = await readErrorBody(response);
    return { ok: false, code: body.code, message: body.message };
  }
  const payload = (await response.json()) as { data: ItemMaster };
  return { ok: true, item: payload.data };
}
