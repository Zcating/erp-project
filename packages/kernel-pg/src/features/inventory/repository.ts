import type {
  StockBalance,
  StockBalanceKey,
  StockLedgerEntry,
  StockLedgerRepository,
  TransactionContext,
} from "@erp-inventory-sales/kernel";
import { and, asc, eq, or } from "drizzle-orm";
import type { KernelDatabase } from "../../db/client.js";
import type { PgTransaction } from "../../db/transactions.js";
import { inventoryBalances, inventoryLedgerEntries } from "../../schema/inventory.js";

type InventoryExecutor = KernelDatabase | PgTransaction;

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
      warehouseId: string,
      itemId: string | null,
      context?: TransactionContext,
    ): Promise<StockBalance[]> {
      const executor = executorOf(context);
      const conditions = [eq(inventoryBalances.warehouseId, warehouseId)];
      if (itemId !== null) {
        conditions.push(eq(inventoryBalances.itemId, itemId));
      }
      const rows = await executor
        .select(balanceColumns)
        .from(inventoryBalances)
        .where(and(...conditions))
        .orderBy(asc(inventoryBalances.itemId));
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
  };
}
