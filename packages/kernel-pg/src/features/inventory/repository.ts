import type {
  StockBalance,
  StockBalanceKey,
  StockLedgerEntry,
  StockLedgerRepository,
  StockMovement,
  StockMovementFilter,
  TransactionContext,
} from "@erp-inventory-sales/kernel";
import { and, asc, desc, eq, gte, lte, or } from "drizzle-orm";
import type { KernelDatabase } from "../../db/client.js";
import type { PgTransaction } from "../../db/transactions.js";
import { inventoryBalances, inventoryLedgerEntries } from "../../schema/inventory.js";

type InventoryExecutor = KernelDatabase | PgTransaction;

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

export function createStockLedgerRepository(db: KernelDatabase): StockLedgerRepository {
  const executorOf = (context?: TransactionContext): InventoryExecutor => {
    if (context === undefined) {
      return db;
    }
    const handle = context.handle as PgTransaction | undefined;
    if (handle === undefined || handle === null) {
      throw new Error("事务上下文缺少事务句柄");
    }
    return handle;
  };

  const balanceColumns = {
    warehouseId: inventoryBalances.warehouseId,
    itemId: inventoryBalances.itemId,
    quantity: inventoryBalances.quantity,
    unitCost: inventoryBalances.unitCost,
  };

  const entryColumns = {
    documentId: inventoryLedgerEntries.documentId,
    documentNo: inventoryLedgerEntries.documentNo,
    lineNo: inventoryLedgerEntries.lineNo,
    warehouseId: inventoryLedgerEntries.warehouseId,
    itemId: inventoryLedgerEntries.itemId,
    direction: inventoryLedgerEntries.direction,
    quantityBefore: inventoryLedgerEntries.quantityBefore,
    quantityAfter: inventoryLedgerEntries.quantityAfter,
    costBefore: inventoryLedgerEntries.costBefore,
    costAfter: inventoryLedgerEntries.costAfter,
    unitPrice: inventoryLedgerEntries.unitPrice,
    amount: inventoryLedgerEntries.amount,
    createdAt: inventoryLedgerEntries.createdAt,
  };

  const toBalance = (row: {
    warehouseId: string;
    itemId: string;
    quantity: string;
    unitCost: string;
  }): StockBalance => ({
    warehouseId: row.warehouseId,
    itemId: row.itemId,
    quantity: row.quantity,
    unitCost: row.unitCost,
  });

  const toEntry = (row: {
    documentId: string;
    documentNo: string;
    lineNo: number;
    warehouseId: string;
    itemId: string;
    direction: string;
    quantityBefore: string;
    quantityAfter: string;
    costBefore: string;
    costAfter: string;
    unitPrice: string;
    amount: string;
  }): StockLedgerEntry => ({
    documentId: row.documentId,
    documentNo: row.documentNo,
    lineNo: row.lineNo,
    warehouseId: row.warehouseId,
    itemId: row.itemId,
    direction: row.direction as StockLedgerEntry["direction"],
    quantityBefore: row.quantityBefore,
    quantityAfter: row.quantityAfter,
    costBefore: row.costBefore,
    costAfter: row.costAfter,
    unitPrice: row.unitPrice,
    amount: row.amount,
  });

  const toMovement = (row: {
    documentId: string;
    documentNo: string;
    lineNo: number;
    warehouseId: string;
    itemId: string;
    direction: string;
    quantityBefore: string;
    quantityAfter: string;
    costBefore: string;
    costAfter: string;
    unitPrice: string;
    amount: string;
    createdAt: Date;
  }): StockMovement => ({
    ...toEntry(row),
    occurredAt: row.createdAt.toISOString(),
  });

  return {
    async findBalance(
      warehouseId: string,
      itemId: string,
      context?: TransactionContext,
    ): Promise<StockBalance | null> {
      const executor = executorOf(context);
      const rows = await executor
        .select(balanceColumns)
        .from(inventoryBalances)
        .where(
          and(eq(inventoryBalances.warehouseId, warehouseId), eq(inventoryBalances.itemId, itemId)),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toBalance(row);
    },

    async listBalances(
      warehouseId: string | null,
      itemId: string | null,
      context?: TransactionContext,
    ): Promise<StockBalance[]> {
      const executor = executorOf(context);
      const conditions = [];
      if (warehouseId !== null) {
        conditions.push(eq(inventoryBalances.warehouseId, warehouseId));
      }
      if (itemId !== null) {
        conditions.push(eq(inventoryBalances.itemId, itemId));
      }
      const rows = await executor
        .select(balanceColumns)
        .from(inventoryBalances)
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(asc(inventoryBalances.warehouseId), asc(inventoryBalances.itemId));
      return rows.map(toBalance);
    },

    async findBalancesForUpdate(
      keys: StockBalanceKey[],
      context?: TransactionContext,
    ): Promise<StockBalance[]> {
      if (keys.length === 0) {
        return [];
      }
      const executor = executorOf(context);
      const rows = await executor
        .select(balanceColumns)
        .from(inventoryBalances)
        .where(
          or(
            ...keys.map((key) =>
              and(
                eq(inventoryBalances.warehouseId, key.warehouseId),
                eq(inventoryBalances.itemId, key.itemId),
              ),
            ),
          ),
        )
        .for("update");
      return rows.map(toBalance);
    },

    async ensureBalances(keys: StockBalanceKey[], context?: TransactionContext): Promise<void> {
      if (keys.length === 0) {
        return;
      }
      const executor = executorOf(context);
      await executor
        .insert(inventoryBalances)
        .values(
          keys.map((key) => ({
            warehouseId: key.warehouseId,
            itemId: key.itemId,
            quantity: EMPTY_QUANTITY,
            unitCost: EMPTY_UNIT_COST,
          })),
        )
        .onConflictDoNothing({
          target: [inventoryBalances.warehouseId, inventoryBalances.itemId],
        });
    },

    async saveBalance(balance: StockBalance, context?: TransactionContext): Promise<void> {
      const executor = executorOf(context);
      await executor
        .insert(inventoryBalances)
        .values({
          warehouseId: balance.warehouseId,
          itemId: balance.itemId,
          quantity: balance.quantity,
          unitCost: balance.unitCost,
        })
        .onConflictDoUpdate({
          target: [inventoryBalances.warehouseId, inventoryBalances.itemId],
          set: {
            quantity: balance.quantity,
            unitCost: balance.unitCost,
          },
        });
    },

    async appendEntries(entries: StockLedgerEntry[], context?: TransactionContext): Promise<void> {
      if (entries.length === 0) {
        return;
      }
      const executor = executorOf(context);
      await executor.insert(inventoryLedgerEntries).values(
        entries.map((entry) => ({
          documentId: entry.documentId,
          documentNo: entry.documentNo,
          lineNo: entry.lineNo,
          warehouseId: entry.warehouseId,
          itemId: entry.itemId,
          direction: entry.direction,
          quantityBefore: entry.quantityBefore,
          quantityAfter: entry.quantityAfter,
          costBefore: entry.costBefore,
          costAfter: entry.costAfter,
          unitPrice: entry.unitPrice,
          amount: entry.amount,
        })),
      );
    },

    async listEntriesByDocument(
      documentId: string,
      context?: TransactionContext,
    ): Promise<StockLedgerEntry[]> {
      const executor = executorOf(context);
      const rows = await executor
        .select(entryColumns)
        .from(inventoryLedgerEntries)
        .where(eq(inventoryLedgerEntries.documentId, documentId))
        .orderBy(asc(inventoryLedgerEntries.seq));
      return rows.map(toEntry);
    },

    async listEntriesByDocumentNo(
      documentNo: string,
      context?: TransactionContext,
    ): Promise<StockLedgerEntry[]> {
      const executor = executorOf(context);
      const rows = await executor
        .select(entryColumns)
        .from(inventoryLedgerEntries)
        .where(eq(inventoryLedgerEntries.documentNo, documentNo))
        .orderBy(asc(inventoryLedgerEntries.seq));
      return rows.map(toEntry);
    },

    async listMovements(
      filter: StockMovementFilter,
      context?: TransactionContext,
    ): Promise<StockMovement[]> {
      const executor = executorOf(context);
      const conditions = [];
      if (filter.documentNo !== null) {
        conditions.push(eq(inventoryLedgerEntries.documentNo, filter.documentNo));
      }
      if (filter.warehouseId !== null) {
        conditions.push(eq(inventoryLedgerEntries.warehouseId, filter.warehouseId));
      }
      if (filter.itemId !== null) {
        conditions.push(eq(inventoryLedgerEntries.itemId, filter.itemId));
      }
      if (filter.lineNo !== null) {
        conditions.push(eq(inventoryLedgerEntries.lineNo, filter.lineNo));
      }
      if (filter.occurredFrom !== null) {
        conditions.push(gte(inventoryLedgerEntries.createdAt, new Date(filter.occurredFrom)));
      }
      if (filter.occurredTo !== null) {
        conditions.push(lte(inventoryLedgerEntries.createdAt, new Date(filter.occurredTo)));
      }
      const rows = await executor
        .select(entryColumns)
        .from(inventoryLedgerEntries)
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(
          ...(filter.order === "desc"
            ? [desc(inventoryLedgerEntries.createdAt), desc(inventoryLedgerEntries.seq)]
            : [asc(inventoryLedgerEntries.createdAt), asc(inventoryLedgerEntries.seq)]),
        );
      return rows.map(toMovement);
    },
  };
}
