import { revaluedUnitCost, weightedAverageUnitCost } from "./costing.js";
import { createInMemoryStockLedgerRepository } from "./in-memory-repository.js";
import { STOCK_LEDGER_DIRECTIONS } from "./model.js";
import type {
  StockBalance,
  StockBalanceFilter,
  StockBalanceSummary,
  StockLedgerDirection,
  StockLedgerEntry,
  StockMovement,
  StockMovementFilter,
  StockMovementOrder,
} from "./model.js";
import type {
  InTransitQuantity,
  InTransitQuantityReader,
  StockBalanceKey,
  StockLedgerRepository,
} from "./ports.js";
import { createInventoryQueryService } from "./service.js";
import type { InventoryQueryService, InventoryQueryServiceOptions } from "./service.js";

export const inventory = {
  STOCK_LEDGER_DIRECTIONS,
  createInMemoryStockLedgerRepository,
  createInventoryQueryService,
  revaluedUnitCost,
  weightedAverageUnitCost,
};

export {
  STOCK_LEDGER_DIRECTIONS,
  createInMemoryStockLedgerRepository,
  createInventoryQueryService,
  revaluedUnitCost,
  weightedAverageUnitCost,
};

export type { InventoryQueryService, InventoryQueryServiceOptions };
export type {
  StockBalance,
  StockBalanceFilter,
  StockBalanceSummary,
  StockLedgerDirection,
  StockLedgerEntry,
  StockMovement,
  StockMovementFilter,
  StockMovementOrder,
};
export type { InTransitQuantity, InTransitQuantityReader, StockBalanceKey, StockLedgerRepository };
