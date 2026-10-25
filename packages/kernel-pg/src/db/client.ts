import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../schema/index.js";
import { databaseUrl } from "./config.js";

export type KernelDatabase = NodePgDatabase<typeof schema>;

export type DatabaseConnection = {
  db: KernelDatabase;
  pool: Pool;
};

export function createDatabase(connectionString: string = databaseUrl()): DatabaseConnection {
  const pool = new Pool({ connectionString });
  return { pool, db: drizzle(pool, { schema }) };
}
