import { weightedAverageUnitCost } from "./costing.js";
import { createInMemoryStockLedgerRepository } from "./in-memory-repository.js";
import { STOCK_LEDGER_DIRECTIONS } from "./model.js";
import type { StockBalance, StockLedgerDirection, StockLedgerEntry } from "./model.js";
import type { StockBalanceKey, StockLedgerRepository } from "./ports.js";
import { createInventoryQueryService } from "./service.js";
import type { InventoryQueryService } from "./service.js";

export const inventory = {
  STOCK_LEDGER_DIRECTIONS,
  createInMemoryStockLedgerRepository,
  createInventoryQueryService,
  weightedAverageUnitCost,
};

export {
  STOCK_LEDGER_DIRECTIONS,
  createInMemoryStockLedgerRepository,
  createInventoryQueryService,
  weightedAverageUnitCost,
};

export type { InventoryQueryService };
export type { StockBalance, StockLedgerDirection, StockLedgerEntry };
export type { StockBalanceKey, StockLedgerRepository };
