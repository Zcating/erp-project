import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolConfig } from "pg";
import { createDatabase } from "./db/client.js";
import type { DatabaseConnection, KernelDatabase } from "./db/client.js";
import { createItemMasterRepository } from "./features/item-master/repository.js";

export type { DatabaseConnection, KernelDatabase, NodePgDatabase, PoolConfig };

export {
  amountType,
  conversionRateType,
  quantityType,
  unitPriceType,
  type DecimalText,
} from "./schema/index.js";
export { erpSchema, itemAuxiliaryUnits, items } from "./schema/index.js";

export const kernelPg = {
  createDatabase,
  createItemMasterRepository,
};

export { createDatabase, createItemMasterRepository };

export { databaseUrl } from "./db/config.js";
