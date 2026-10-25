import type { ItemMasterInput, ItemMasterService } from "@erp-inventory-sales/kernel";
import { ValidationError } from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope.js";
import { itemMasterBodySchema, type ItemMasterBody } from "./schema.js";

export type ItemMasterRouteDeps = {
  service: ItemMasterService;
};

export function registerItemMasterRoutes(app: FastifyInstance, deps: ItemMasterRouteDeps): void {
  app.post("/api/items", async (request) => {
    const body = itemMasterBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError("请求体必须是商品档案对象");
    }
    const item = await deps.service.create(toItemMasterInput(body.data));
    return success(item);
  });

  app.get("/api/items", async () => {
    const items = await deps.service.list();
    return success({ items });
  });

  app.get("/api/items/by-barcode/:barcode", async (request) => {
    const params = request.params as { barcode: string };
    const item = await deps.service.findByBarcode(params.barcode);
    return success(item);
  });

  app.get("/api/items/:id", async (request) => {
    const params = request.params as { id: string };
    const item = await deps.service.get(params.id);
    return success(item);
  });

  app.put("/api/items/:id", async (request) => {
    const params = request.params as { id: string };
    const body = itemMasterBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError("请求体必须是商品档案对象");
    }
    const item = await deps.service.update(params.id, toItemMasterInput(body.data));
    return success(item);
  });

  app.delete("/api/items/:id", async (request) => {
    const params = request.params as { id: string };
    await deps.service.remove(params.id);
    return success({ id: params.id });
  });
}

function toItemMasterInput(body: ItemMasterBody): ItemMasterInput {
  return {
    code: body.code ?? "",
    barcode: body.barcode ?? null,
    name: body.name ?? "",
    specification: body.specification ?? null,
    brand: body.brand ?? null,
    category: body.category ?? null,
    baseUnit: body.baseUnit ?? "",
    auxiliaryUnits: (body.auxiliaryUnits ?? []).map((auxiliaryUnit) => ({
      unit: auxiliaryUnit.unit,
      conversionRate: auxiliaryUnit.conversionRate,
    })),
  };
}
