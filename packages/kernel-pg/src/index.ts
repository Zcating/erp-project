import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolConfig } from "pg";
import { createDatabase } from "./db/client.js";
import type { DatabaseConnection, KernelDatabase } from "./db/client.js";
import { createTransactionRunner } from "./db/transactions.js";
import type { PgTransaction } from "./db/transactions.js";
import { createDocumentRepository } from "./features/documents/repository.js";
import { createStockLedgerRepository } from "./features/inventory/repository.js";
import { createItemMasterRepository } from "./features/item-master/repository.js";
import {
  createCustomerRepository,
  createSupplierRepository,
  createWarehouseRepository,
} from "./features/parties/repository.js";

export type { DatabaseConnection, KernelDatabase, NodePgDatabase, PgTransaction, PoolConfig };

export {
  amountType,
  conversionRateType,
  documentLines,
  documentNumberCounters,
  documents,
  inventoryBalances,
  inventoryLedgerEntries,
  quantityType,
  unitPriceType,
  type DecimalText,
} from "./schema/index.js";
export {
  customers,
  erpSchema,
  itemAuxiliaryUnits,
  items,
  suppliers,
  warehouses,
} from "./schema/index.js";

export const kernelPg = {
  createDatabase,
  createCustomerRepository,
  createDocumentRepository,
  createItemMasterRepository,
  createStockLedgerRepository,
  createSupplierRepository,
  createTransactionRunner,
  createWarehouseRepository,
};

export {
  createDatabase,
  createCustomerRepository,
  createDocumentRepository,
  createItemMasterRepository,
  createStockLedgerRepository,
  createSupplierRepository,
  createTransactionRunner,
  createWarehouseRepository,
};

export { databaseUrl } from "./db/config.js";
