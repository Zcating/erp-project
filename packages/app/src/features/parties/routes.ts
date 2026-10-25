import type {
  Customer,
  CustomerInput,
  CustomerService,
  Supplier,
  SupplierInput,
  SupplierService,
  Warehouse,
  WarehouseInput,
  WarehouseService,
} from "@erp-inventory-sales/kernel";
import { ValidationError } from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { z } from "@erp-inventory-sales/shared";
import { success } from "../../shared/envelope.js";
import {
  customerBodySchema,
  supplierBodySchema,
  warehouseBodySchema,
  type CustomerBody,
  type SupplierBody,
  type WarehouseBody,
} from "./schema.js";

export type SupplierRouteDeps = {
  service: SupplierService;
};

export type CustomerRouteDeps = {
  service: CustomerService;
};

export type WarehouseRouteDeps = {
  service: WarehouseService;
};

export function registerSupplierRoutes(app: FastifyInstance, deps: SupplierRouteDeps): void {
  registerPartyRoutes<Supplier, SupplierInput, SupplierBody>(app, {
    path: "/api/suppliers",
    listKey: "suppliers",
    label: "供应商",
    bodySchema: supplierBodySchema,
    toInput: (body) => ({
      code: body.code ?? "",
      name: body.name ?? "",
      contact: body.contact ?? null,
    }),
    service: deps.service,
  });
}

export function registerCustomerRoutes(app: FastifyInstance, deps: CustomerRouteDeps): void {
  registerPartyRoutes<Customer, CustomerInput, CustomerBody>(app, {
    path: "/api/customers",
    listKey: "customers",
    label: "客户",
    bodySchema: customerBodySchema,
    toInput: (body) => ({
      code: body.code ?? "",
      name: body.name ?? "",
      contact: body.contact ?? null,
    }),
    service: deps.service,
  });
}

export function registerWarehouseRoutes(app: FastifyInstance, deps: WarehouseRouteDeps): void {
  registerPartyRoutes<Warehouse, WarehouseInput, WarehouseBody>(app, {
    path: "/api/warehouses",
    listKey: "warehouses",
    label: "仓库",
    bodySchema: warehouseBodySchema,
    toInput: (body) => ({
      code: body.code ?? "",
      name: body.name ?? "",
      purpose: body.purpose ?? null,
    }),
    service: deps.service,
  });
}

type PartyRouteService<TRecord, TInput> = {
  list(): Promise<TRecord[]>;
  get(id: string): Promise<TRecord>;
  create(input: TInput): Promise<TRecord>;
  update(id: string, input: TInput): Promise<TRecord>;
  remove(id: string): Promise<void>;
};

type PartyRouteConfig<TRecord, TInput, TBody> = {
  path: string;
  listKey: string;
  label: string;
  bodySchema: z.ZodType<TBody>;
  toInput: (body: TBody) => TInput;
  service: PartyRouteService<TRecord, TInput>;
};

function registerPartyRoutes<TRecord, TInput, TBody>(
  app: FastifyInstance,
  config: PartyRouteConfig<TRecord, TInput, TBody>,
): void {
  const parseBody = (body: unknown): TInput => {
    const parsed = config.bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(`请求体必须是${config.label}对象`);
    }
    return config.toInput(parsed.data);
  };

  app.post(config.path, async (request) => {
    const record = await config.service.create(parseBody(request.body));
    return success(record);
  });

  app.get(config.path, async () => {
    const records = await config.service.list();
    return success({ [config.listKey]: records });
  });

  app.get(`${config.path}/:id`, async (request) => {
    const params = request.params as { id: string };
    const record = await config.service.get(params.id);
    return success(record);
  });

  app.put(`${config.path}/:id`, async (request) => {
    const params = request.params as { id: string };
    const record = await config.service.update(params.id, parseBody(request.body));
    return success(record);
  });

  app.delete(`${config.path}/:id`, async (request) => {
    const params = request.params as { id: string };
    await config.service.remove(params.id);
    return success({ id: params.id });
  });
}
