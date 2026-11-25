import type {
  InventoryQueryService,
  StockBalanceFilter,
  StockMovementFilter,
  StockMovementOrder,
} from "@erp-project/kernel";
import { ValidationError } from "@erp-project/kernel";
import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope";

export type InventoryRouteDeps = {
  service: InventoryQueryService;
};

type BalanceQuery = {
  warehouseId?: string;
  itemId?: string;
};

type MovementQuery = {
  documentNo?: string;
  warehouseId?: string;
  itemId?: string;
  lineNo?: string;
  from?: string;
  to?: string;
  order?: string;
};

export function registerInventoryRoutes(app: FastifyInstance, deps: InventoryRouteDeps): void {
  app.get("/api/inventory/balances", async (request) => {
    const query = request.query as BalanceQuery;
    const filter: StockBalanceFilter = {
      warehouseId: optionalText(query.warehouseId),
      itemId: optionalText(query.itemId),
    };
    return success({ balances: await deps.service.listBalances(filter) });
  });

  app.get("/api/inventory/movements", async (request) => {
    const query = request.query as MovementQuery;
    const filter: StockMovementFilter = {
      documentNo: optionalText(query.documentNo),
      warehouseId: optionalText(query.warehouseId),
      itemId: optionalText(query.itemId),
      lineNo: optionalLineNo(query.lineNo),
      occurredFrom: optionalInstant(query.from),
      occurredTo: optionalInstant(query.to),
      order: optionalOrder(query.order),
    };
    return success({ movements: await deps.service.listMovements(filter) });
  });
}

function optionalText(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function optionalLineNo(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`行号必须是不小于 1 的整数：${trimmed}`);
  }
  return parsed;
}

function optionalInstant(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`时间格式不合法：${trimmed}`);
  }
  return new Date(parsed).toISOString();
}

function optionalOrder(value: string | undefined): StockMovementOrder {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (trimmed === "") {
    return "asc";
  }
  if (trimmed !== "asc" && trimmed !== "desc") {
    throw new ValidationError(`排序方向只能是 asc 或 desc：${trimmed}`);
  }
  return trimmed;
}
