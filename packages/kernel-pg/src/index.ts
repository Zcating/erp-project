import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolConfig } from "pg";
import { createDatabase } from "./db/client";
import type { DatabaseConnection, KernelDatabase } from "./db/client";
import { createTransactionRunner } from "./db/transactions";
import type { PgTransaction } from "./db/transactions";
import { createDocumentRepository } from "./features/documents/repository";
import { createStockLedgerRepository } from "./features/inventory/repository";
import { createItemMasterRepository } from "./features/item-master/repository";
import {
  createCustomerRepository,
  createSupplierRepository,
  createWarehouseRepository,
} from "./features/parties/repository";
import { createTransferInTransitRepository } from "./features/transfer/repository";

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
} from "./schema";
export {
  customers,
  erpSchema,
  itemAuxiliaryUnits,
  items,
  suppliers,
  transferInTransit,
  warehouses,
} from "./schema";

export const kernelPg = {
  createDatabase,
  createCustomerRepository,
  createDocumentRepository,
  createItemMasterRepository,
  createStockLedgerRepository,
  createSupplierRepository,
  createTransactionRunner,
  createTransferInTransitRepository,
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
  createTransferInTransitRepository,
  createWarehouseRepository,
};

export { databaseUrl } from "./db/config";
