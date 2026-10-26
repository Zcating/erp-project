import type { InventoryQueryService } from "@erp-inventory-sales/kernel";
import { ValidationError } from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope.js";

export type InventoryRouteDeps = {
  service: InventoryQueryService;
};

export function registerInventoryRoutes(app: FastifyInstance, deps: InventoryRouteDeps): void {
  app.get("/api/inventory/movements", async (request) => {
    const query = request.query as { documentNo?: string };
    const documentNo = (query.documentNo ?? "").trim();
    if (documentNo === "") {
      throw new ValidationError("缺少单据号");
    }
    return success({ movements: await deps.service.listMovements(documentNo) });
  });

  app.get("/api/inventory/balances", async (request) => {
    const query = request.query as { warehouseId?: string; itemId?: string };
    const warehouseId = (query.warehouseId ?? "").trim();
    if (warehouseId === "") {
      throw new ValidationError("缺少仓库");
    }
    const itemId = (query.itemId ?? "").trim();
    return success({
      balances: await deps.service.listBalances(warehouseId, itemId === "" ? null : itemId),
    });
  });
}
