import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolConfig } from "pg";

export type { NodePgDatabase, PoolConfig };

export { amountType, quantityType, unitPriceType, type DecimalText } from "./schema/index.js";

export const kernelPg = {};
