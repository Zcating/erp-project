import { revaluedUnitCost, weightedAverageUnitCost } from "./costing";
import { createInMemoryStockLedgerRepository } from "./in-memory-repository";
import { STOCK_LEDGER_DIRECTIONS } from "./model";
import type {
  StockBalance,
  StockBalanceFilter,
  StockBalanceSummary,
  StockLedgerDirection,
  StockLedgerEntry,
  StockMovement,
  StockMovementFilter,
  StockMovementOrder,
} from "./model";
import type {
  InTransitQuantity,
  InTransitQuantityReader,
  StockBalanceKey,
  StockLedgerRepository,
} from "./ports";
import { createInventoryQueryService } from "./service";
import type { InventoryQueryService, InventoryQueryServiceOptions } from "./service";

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
