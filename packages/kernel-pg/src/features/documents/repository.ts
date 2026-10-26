import type {
  Document,
  DocumentFilter,
  DocumentRepository,
  DocumentStatus,
  DocumentType,
  DraftDocumentType,
  MasterDataReference,
  TransactionContext,
} from "@erp-inventory-sales/kernel";
import { DuplicateError, ValidationError } from "@erp-inventory-sales/kernel";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { KernelDatabase } from "../../db/client.js";
import type { PgTransaction } from "../../db/transactions.js";
import { documentLines, documentNumberCounters, documents } from "../../schema/documents.js";

type DocumentExecutor = KernelDatabase | PgTransaction;

type DocumentRow = {
  id: string;
  documentNo: string;
  type: string;
  status: string;
  supplierId: string | null;
  customerId: string | null;
  sourceWarehouseId: string | null;
  targetWarehouseId: string | null;
  warehouseId: string | null;
};

type DocumentLineRow = {
  id: string;
  documentId: string;
  lineNo: number;
  itemId: string;
  quantity: string;
  unitPrice: string | null;
  amount: string | null;
  originalLineId: string | null;
};

const documentColumns = {
  id: documents.id,
  documentNo: documents.documentNo,
  type: documents.type,
  status: documents.status,
  supplierId: documents.supplierId,
  customerId: documents.customerId,
  sourceWarehouseId: documents.sourceWarehouseId,
  targetWarehouseId: documents.targetWarehouseId,
  warehouseId: documents.warehouseId,
};

const documentLineColumns = {
  id: documentLines.id,
  documentId: documentLines.documentId,
  lineNo: documentLines.lineNo,
  itemId: documentLines.itemId,
  quantity: documentLines.quantity,
  unitPrice: documentLines.unitPrice,
  amount: documentLines.amount,
  originalLineId: documentLines.originalLineId,
};

const FOREIGN_KEY_LABELS: Record<string, string> = {
  documents_supplier_id_suppliers_id_fk: "供应商",
  documents_customer_id_customers_id_fk: "客户",
  documents_source_warehouse_id_warehouses_id_fk: "来源仓库",
  documents_target_warehouse_id_warehouses_id_fk: "目标仓库",
  documents_warehouse_id_warehouses_id_fk: "仓库",
  document_lines_original_line_id_document_lines_id_fk: "原单据行",
};

export function createDocumentRepository(db: KernelDatabase): DocumentRepository {
  const executorOf = (context?: TransactionContext): DocumentExecutor => {
    if (context === undefined) {
      return db;
    }
    const handle = context.handle as PgTransaction | undefined;
    if (handle === undefined || handle === null) {
      throw new Error("事务上下文缺少事务句柄");
    }
    return handle;
  };

  const toDomain = (row: DocumentRow, lines: DocumentLineRow[]): Document => ({
    id: row.id,
    documentNo: row.documentNo,
    type: row.type as DraftDocumentType,
    status: row.status as DocumentStatus,
    supplierId: row.supplierId,
    customerId: row.customerId,
    sourceWarehouseId: row.sourceWarehouseId,
    targetWarehouseId: row.targetWarehouseId,
    warehouseId: row.warehouseId,
    lines: lines.map((line) => ({
      id: line.id,
      lineNo: line.lineNo,
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      originalLineId: line.originalLineId,
    })),
  });

  const linesOf = async (
    executor: DocumentExecutor,
    documentIds: string[],
  ): Promise<Map<string, DocumentLineRow[]>> => {
    const grouped = new Map<string, DocumentLineRow[]>();
    if (documentIds.length === 0) {
      return grouped;
    }
    const rows = await executor
      .select(documentLineColumns)
      .from(documentLines)
      .where(inArray(documentLines.documentId, documentIds))
      .orderBy(asc(documentLines.lineNo));
    for (const row of rows) {
      const current = grouped.get(row.documentId) ?? [];
      current.push(row);
      grouped.set(row.documentId, current);
    }
    return grouped;
  };

  const lineValues = (document: Document) =>
    document.lines.map((line) => ({
      id: line.id,
      documentId: document.id,
      lineNo: line.lineNo,
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      originalLineId: line.originalLineId,
    }));

  const applyInsert = async (executor: DocumentExecutor, document: Document): Promise<void> => {
    await executor.insert(documents).values({
      id: document.id,
      documentNo: document.documentNo,
      type: document.type,
      status: document.status,
      supplierId: document.supplierId,
      customerId: document.customerId,
      sourceWarehouseId: document.sourceWarehouseId,
      targetWarehouseId: document.targetWarehouseId,
      warehouseId: document.warehouseId,
    });
    if (document.lines.length > 0) {
      await executor.insert(documentLines).values(lineValues(document));
    }
  };

  const applyUpdate = async (executor: DocumentExecutor, document: Document): Promise<void> => {
    await executor
      .update(documents)
      .set({
        type: document.type,
        status: document.status,
        supplierId: document.supplierId,
        customerId: document.customerId,
        sourceWarehouseId: document.sourceWarehouseId,
        targetWarehouseId: document.targetWarehouseId,
        warehouseId: document.warehouseId,
      })
      .where(eq(documents.id, document.id));
    await executor.delete(documentLines).where(eq(documentLines.documentId, document.id));
    if (document.lines.length > 0) {
      await executor.insert(documentLines).values(lineValues(document));
    }
  };

  return {
    async list(filter: DocumentFilter, context?: TransactionContext): Promise<Document[]> {
      const executor = executorOf(context);
      const conditions = [];
      if (filter.type !== null) {
        conditions.push(eq(documents.type, filter.type));
      }
      if (filter.status !== null) {
        conditions.push(eq(documents.status, filter.status));
      }
      const rows = await executor
        .select(documentColumns)
        .from(documents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(documents.createdAt), desc(documents.documentNo));
      const grouped = await linesOf(
        executor,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toDomain(row, grouped.get(row.id) ?? []));
    },

    async findById(id: string, context?: TransactionContext): Promise<Document | null> {
      const executor = executorOf(context);
      const rows = await executor
        .select(documentColumns)
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      const grouped = await linesOf(executor, [row.id]);
      return toDomain(row, grouped.get(row.id) ?? []);
    },

    async findByIdForUpdate(id: string, context?: TransactionContext): Promise<Document | null> {
      const executor = executorOf(context);
      const rows = await executor
        .select(documentColumns)
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1)
        .for("update");
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      const grouped = await linesOf(executor, [row.id]);
      return toDomain(row, grouped.get(row.id) ?? []);
    },

    async findByDocumentNo(
      documentNo: string,
      context?: TransactionContext,
    ): Promise<Document | null> {
      const executor = executorOf(context);
      const rows = await executor
        .select(documentColumns)
        .from(documents)
        .where(eq(documents.documentNo, documentNo))
        .limit(1);
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      const grouped = await linesOf(executor, [row.id]);
      return toDomain(row, grouped.get(row.id) ?? []);
    },

    async findByLineId(lineId: string, context?: TransactionContext): Promise<Document | null> {
      const executor = executorOf(context);
      const rows = await executor
        .select({ documentId: documentLines.documentId })
        .from(documentLines)
        .where(eq(documentLines.id, lineId))
        .limit(1);
      const documentId = rows[0]?.documentId;
      if (documentId === undefined) {
        return null;
      }
      const documentRows = await executor
        .select(documentColumns)
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
      const row = documentRows[0];
      if (row === undefined) {
        return null;
      }
      const grouped = await linesOf(executor, [row.id]);
      return toDomain(row, grouped.get(row.id) ?? []);
    },

    async sumPostedReturnedQuantity(
      originalLineId: string,
      context?: TransactionContext,
    ): Promise<string> {
      const executor = executorOf(context);
      const rows = await executor
        .select({ total: sql<string>`coalesce(sum(${documentLines.quantity}), 0)::text` })
        .from(documentLines)
        .innerJoin(documents, eq(documents.id, documentLines.documentId))
        .where(
          and(eq(documentLines.originalLineId, originalLineId), eq(documents.status, "POSTED")),
        );
      return rows[0]?.total ?? "0";
    },

    async listReturnLineReferences(
      originalLineId: string,
      context?: TransactionContext,
    ): Promise<Array<{ documentId: string; lineNo: number }>> {
      const executor = executorOf(context);
      const rows = await executor
        .select({
          documentId: documentLines.documentId,
          lineNo: documentLines.lineNo,
        })
        .from(documentLines)
        .where(eq(documentLines.originalLineId, originalLineId));
      return rows.map((row) => ({ documentId: row.documentId, lineNo: row.lineNo }));
    },

    async insert(document: Document, context?: TransactionContext): Promise<void> {
      try {
        if (context === undefined) {
          await db.transaction(async (tx) => applyInsert(tx, document));
        } else {
          await applyInsert(executorOf(context), document);
        }
      } catch (error) {
        throw translateWriteError(error);
      }
    },

    async update(document: Document, context?: TransactionContext): Promise<void> {
      const executor = executorOf(context);
      try {
        if (context === undefined) {
          await db.transaction(async (tx) => applyUpdate(tx, document));
        } else {
          await applyUpdate(executor, document);
        }
      } catch (error) {
        throw translateWriteError(error);
      }
    },

    async updateStatus(
      id: string,
      from: DocumentStatus,
      to: DocumentStatus,
      context?: TransactionContext,
    ): Promise<boolean> {
      const executor = executorOf(context);
      const updated = await executor
        .update(documents)
        .set({ status: to })
        .where(and(eq(documents.id, id), eq(documents.status, from)))
        .returning({ id: documents.id });
      return updated.length > 0;
    },

    async remove(id: string, context?: TransactionContext): Promise<boolean> {
      const executor = executorOf(context);
      const deleted = await executor
        .delete(documents)
        .where(eq(documents.id, id))
        .returning({ id: documents.id });
      return deleted.length > 0;
    },

    async nextSequence(
      type: DocumentType,
      dateKey: string,
      context?: TransactionContext,
    ): Promise<number> {
      const executor = executorOf(context);
      const rows = await executor
        .insert(documentNumberCounters)
        .values({ type, dateKey, nextValue: 1 })
        .onConflictDoUpdate({
          target: [documentNumberCounters.type, documentNumberCounters.dateKey],
          set: { nextValue: sql`${documentNumberCounters.nextValue} + 1` },
        })
        .returning({ nextValue: documentNumberCounters.nextValue });
      const sequence = rows[0]?.nextValue;
      if (sequence === undefined) {
        throw new Error("单据序号计数器没有返回序号");
      }
      return sequence;
    },

    async findMasterDataReferences(
      masterDataId: string,
      context?: TransactionContext,
    ): Promise<MasterDataReference[]> {
      const executor = executorOf(context);
      const rows = await executor
        .select({ documentNo: documents.documentNo })
        .from(documents)
        .where(
          or(
            eq(documents.supplierId, masterDataId),
            eq(documents.customerId, masterDataId),
            eq(documents.sourceWarehouseId, masterDataId),
            eq(documents.targetWarehouseId, masterDataId),
            eq(documents.warehouseId, masterDataId),
          ),
        )
        .limit(50);
      return rows.map((row) => ({ documentNo: row.documentNo }));
    },

    async findPostedItemReferences(
      itemId: string,
      context?: TransactionContext,
    ): Promise<MasterDataReference[]> {
      const executor = executorOf(context);
      const rows = await executor
        .selectDistinct({ documentNo: documents.documentNo })
        .from(documents)
        .innerJoin(documentLines, eq(documentLines.documentId, documents.id))
        .where(
          and(eq(documentLines.itemId, itemId), inArray(documents.status, ["POSTED", "VOIDED"])),
        )
        .limit(50);
      return rows.map((row) => ({ documentNo: row.documentNo }));
    },
  };
}

function translateWriteError(error: unknown): unknown {
  const outer = error as { code?: unknown; constraint?: unknown; cause?: unknown } | null;
  if (outer === null || typeof outer !== "object") {
    return error;
  }
  const source =
    outer.cause !== undefined && outer.cause !== null && typeof outer.cause === "object"
      ? (outer.cause as { code?: unknown; constraint?: unknown })
      : outer;
  if (source.code === "23505" && source.constraint === "documents_document_no_key") {
    return new DuplicateError("单据号重复");
  }
  if (source.code === "23503") {
    const label =
      typeof source.constraint === "string"
        ? (FOREIGN_KEY_LABELS[source.constraint] ?? "引用的主数据")
        : "引用的主数据";
    return new ValidationError(`单据引用的${label}不存在`);
  }
  return error;
}
