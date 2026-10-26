import type { TransactionContext, TransactionRunner } from "@erp-inventory-sales/kernel";
import { randomUUID } from "node:crypto";
import type { KernelDatabase } from "./client";

type TransactionCallback = Parameters<KernelDatabase["transaction"]>[0];

export type PgTransaction = Parameters<TransactionCallback>[0];

export function createTransactionRunner(db: KernelDatabase): TransactionRunner {
  return {
    async run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        const context: TransactionContext = { transactionId: randomUUID(), handle: tx };
        return work(context);
      });
    },
  };
}
