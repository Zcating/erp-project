import type {
  InTransitQuantity,
  TransferInTransitRecord,
  TransferInTransitRepository,
  TransactionContext,
} from "@erp-project/kernel";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { KernelDatabase } from "../../db/client";
import type { PgTransaction } from "../../db/transactions";
import { transferInTransit } from "../../schema/transfer";

type TransferExecutor = KernelDatabase | PgTransaction;

type TransferRow = {
  id: string;
  documentId: string;
  documentNo: string;
  lineNo: number;
  itemId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  quantity: string;
  unitCost: string;
  status: string;
};

const transferColumns = {
  id: transferInTransit.id,
  documentId: transferInTransit.documentId,
  documentNo: transferInTransit.documentNo,
  lineNo: transferInTransit.lineNo,
  itemId: transferInTransit.itemId,
  sourceWarehouseId: transferInTransit.sourceWarehouseId,
  targetWarehouseId: transferInTransit.targetWarehouseId,
  quantity: transferInTransit.quantity,
  unitCost: transferInTransit.unitCost,
  status: transferInTransit.status,
};

export function createTransferInTransitRepository(db: KernelDatabase): TransferInTransitRepository {
  const executorOf = (context?: TransactionContext): TransferExecutor => {
    if (context === undefined) {
      return db;
    }
    const handle = context.handle as PgTransaction | undefined;
    if (handle === undefined || handle === null) {
      throw new Error("事务上下文缺少事务句柄");
    }
    return handle;
  };

  const toRecord = (row: TransferRow): TransferInTransitRecord => ({
    id: row.id,
    documentId: row.documentId,
    documentNo: row.documentNo,
    lineNo: row.lineNo,
    itemId: row.itemId,
    sourceWarehouseId: row.sourceWarehouseId,
    targetWarehouseId: row.targetWarehouseId,
    quantity: row.quantity,
    unitCost: row.unitCost,
    status: row.status as TransferInTransitRecord["status"],
  });

  return {
    async create(record: TransferInTransitRecord, context?: TransactionContext): Promise<void> {
      const executor = executorOf(context);
      await executor.insert(transferInTransit).values({
        id: record.id,
        documentId: record.documentId,
        documentNo: record.documentNo,
        lineNo: record.lineNo,
        itemId: record.itemId,
        sourceWarehouseId: record.sourceWarehouseId,
        targetWarehouseId: record.targetWarehouseId,
        quantity: record.quantity,
        unitCost: record.unitCost,
        status: record.status,
      });
    },

    async update(record: TransferInTransitRecord, context?: TransactionContext): Promise<void> {
      const executor = executorOf(context);
      await executor
        .update(transferInTransit)
        .set({
          quantity: record.quantity,
          unitCost: record.unitCost,
          status: record.status,
        })
        .where(eq(transferInTransit.id, record.id));
    },

    async removeByDocument(documentId: string, context?: TransactionContext): Promise<void> {
      const executor = executorOf(context);
      await executor.delete(transferInTransit).where(eq(transferInTransit.documentId, documentId));
    },

    async listByDocument(
      documentId: string,
      context?: TransactionContext,
    ): Promise<TransferInTransitRecord[]> {
      const executor = executorOf(context);
      const rows = await executor
        .select(transferColumns)
        .from(transferInTransit)
        .where(eq(transferInTransit.documentId, documentId))
        .orderBy(asc(transferInTransit.lineNo));
      return rows.map(toRecord);
    },

    async listByDocuments(
      documentIds: string[],
      context?: TransactionContext,
    ): Promise<TransferInTransitRecord[]> {
      if (documentIds.length === 0) {
        return [];
      }
      const executor = executorOf(context);
      const rows = await executor
        .select(transferColumns)
        .from(transferInTransit)
        .where(inArray(transferInTransit.documentId, documentIds))
        .orderBy(asc(transferInTransit.lineNo));
      return rows.map(toRecord);
    },

    async listInTransit(
      warehouseId: string | null,
      itemId: string | null,
      context?: TransactionContext,
    ): Promise<InTransitQuantity[]> {
      const executor = executorOf(context);
      const conditions = [eq(transferInTransit.status, "IN_TRANSIT")];
      if (warehouseId !== null) {
        conditions.push(eq(transferInTransit.sourceWarehouseId, warehouseId));
      }
      if (itemId !== null) {
        conditions.push(eq(transferInTransit.itemId, itemId));
      }
      const rows = await executor
        .select({
          warehouseId: transferInTransit.sourceWarehouseId,
          itemId: transferInTransit.itemId,
          quantity: transferInTransit.quantity,
        })
        .from(transferInTransit)
        .where(and(...conditions))
        .orderBy(asc(transferInTransit.lineNo));
      return rows.map((row) => ({
        warehouseId: row.warehouseId,
        itemId: row.itemId,
        quantity: row.quantity,
      }));
    },
  };
}
