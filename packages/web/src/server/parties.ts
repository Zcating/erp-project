import { createServerFn } from "@tanstack/react-start";
import { fetchApi } from "./client";
import { UnauthenticatedError } from "./errors";

export type Supplier = {
  id: string;
  code: string;
  name: string;
  contact: string | null;
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  contact: string | null;
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  purpose: string | null;
};

export const listSuppliers = createServerFn({ method: "GET" }).handler(
  async (): Promise<Supplier[]> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/suppliers", getRequestHeader("cookie"));
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/suppliers 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { suppliers: Supplier[] } };
    return payload.data.suppliers;
  },
);

export const listCustomers = createServerFn({ method: "GET" }).handler(
  async (): Promise<Customer[]> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/customers", getRequestHeader("cookie"));
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/customers 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { customers: Customer[] } };
    return payload.data.customers;
  },
);

export const listWarehouses = createServerFn({ method: "GET" }).handler(
  async (): Promise<Warehouse[]> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/warehouses", getRequestHeader("cookie"));
    if (response.status === 401) {
      throw new UnauthenticatedError();
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/warehouses 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { warehouses: Warehouse[] } };
    return payload.data.warehouses;
  },
);
