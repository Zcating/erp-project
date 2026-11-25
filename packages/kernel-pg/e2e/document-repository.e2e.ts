import { createDocumentService } from "@erp-project/kernel";
import type { DocumentInput } from "@erp-project/kernel";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import { createTransactionRunner } from "../src/db/transactions.js";
import { createDocumentRepository } from "../src/features/documents/repository.js";
import { createSupplierRepository } from "../src/features/parties/repository.js";
import { createWarehouseRepository } from "../src/features/parties/repository.js";

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const createFixture = async () => {
  const connection = createDatabase(e2eDatabaseUrl());
  const repository = createDocumentRepository(connection.db);
  const service = createDocumentService(repository, {
    runner: createTransactionRunner(connection.db),
    clock: () => new Date(),
    timeZone: "Asia/Shanghai",
  });
  const supplierRepository = createSupplierRepository(connection.db);
  const warehouseRepository = createWarehouseRepository(connection.db);
  const supplier = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-DOC-SUP"),
    name: "可口可乐（中国）饮料有限公司",
    contact: null,
  };
  await supplierRepository.insert(supplier);
  const warehouse = {
    id: crypto.randomUUID(),
    code: uniqueCode("E2E-DOC-WH"),
    name: "杭州总仓",
    purpose: null,
  };
  await warehouseRepository.insert(warehouse);
  const input = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
    type: "PURCHASE_INBOUND",
    supplierId: supplier.id,
    customerId: null,
    sourceWarehouseId: null,
    targetWarehouseId: warehouse.id,
    warehouseId: null,
    lines: [{ itemId: crypto.randomUUID(), quantity: "3", unitPrice: "1.115", amount: "3.35" }],
    ...overrides,
  });
  return { connection, repository, service, supplier, warehouse, input };
};

describe("端到端：单据仓储（Postgres 适配器）", () => {
  it("读回的数量、单价、金额仍是十进制文本，没有退化成二进制浮点", async () => {
    const { connection, service, input } = await createFixture();
    try {
      const created = await service.create(input());

      const reread = await service.get(created.id);

      expect(typeof reread.lines[0]?.quantity).toBe("string");
      expect(typeof reread.lines[0]?.unitPrice).toBe("string");
      expect(typeof reread.lines[0]?.amount).toBe("string");
      expect(reread.lines[0]?.quantity).toBe("3.000");
      expect(reread.lines[0]?.unitPrice).toBe("1.115000");
      expect(reread.lines[0]?.amount).toBe("3.35");
    } finally {
      await connection.pool.end();
    }
  });

  it("并发创建同类型单据时当日序号互不重复", async () => {
    const { connection, service, input } = await createFixture();
    try {
      const created = await Promise.all(
        Array.from({ length: 8 }, async () => service.create(input())),
      );

      const documentNumbers = created.map((document) => document.documentNo);
      expect(new Set(documentNumbers).size).toBe(8);

      const sequences = documentNumbers
        .map((documentNo) => Number(documentNo.split("-")[2]))
        .sort((left, right) => left - right);
      const first = sequences[0] ?? 0;
      expect(sequences).toEqual(sequences.map((_, index) => first + index));
    } finally {
      await connection.pool.end();
    }
  });

  it("单号按类型前缀与服务端当日日期生成", async () => {
    const { connection, service, input } = await createFixture();
    try {
      const created = await service.create(input());

      expect(created.documentNo).toMatch(/^PIN-\d{8}-\d{3}$/);
      expect(created.status).toBe("DRAFT");
    } finally {
      await connection.pool.end();
    }
  });

  it("编辑草稿后读回的是修改后的数量与单价，删除草稿后单据与单据行一并消失", async () => {
    const { connection, service, input } = await createFixture();
    try {
      const created = await service.create(input());

      const updated = await service.update(
        created.id,
        input({
          lines: [
            {
              itemId: created.lines[0]?.itemId ?? "",
              quantity: "4",
              unitPrice: "1.115",
              amount: null,
            },
          ],
        }),
      );
      expect(updated.lines[0]?.quantity).toBe("4.000");
      expect(updated.lines[0]?.amount).toBe("4.46");

      const reread = await service.get(created.id);
      expect(reread.lines[0]?.quantity).toBe("4.000");

      await service.remove(created.id);

      await expect(service.get(created.id)).rejects.toThrow("单据不存在");
      const remaining = await service.list({ type: "PURCHASE_INBOUND", status: null });
      expect(remaining.find((document) => document.id === created.id)).toBeUndefined();
    } finally {
      await connection.pool.end();
    }
  });

  it("列表可以按类型与状态筛选", async () => {
    const { connection, service, input } = await createFixture();
    try {
      const created = await service.create(input());

      const purchaseInbounds = await service.list({ type: "PURCHASE_INBOUND", status: null });
      const saleOutbounds = await service.list({ type: "SALE_OUTBOUND", status: null });
      const drafts = await service.list({ type: null, status: "DRAFT" });

      expect(purchaseInbounds.find((document) => document.id === created.id)).toBeDefined();
      expect(saleOutbounds.find((document) => document.id === created.id)).toBeUndefined();
      expect(drafts.find((document) => document.id === created.id)).toBeDefined();
    } finally {
      await connection.pool.end();
    }
  });

  it("能查出引用了某个供应商与仓库的单据号", async () => {
    const { connection, service, supplier, warehouse, input } = await createFixture();
    try {
      const created = await service.create(input());

      const supplierReferences = await service.findMasterDataReferences(supplier.id);
      const warehouseReferences = await service.findMasterDataReferences(warehouse.id);
      const unknownReferences = await service.findMasterDataReferences(crypto.randomUUID());

      expect(supplierReferences.map((reference) => reference.documentNo)).toContain(
        created.documentNo,
      );
      expect(warehouseReferences.map((reference) => reference.documentNo)).toContain(
        created.documentNo,
      );
      expect(unknownReferences).toEqual([]);
    } finally {
      await connection.pool.end();
    }
  });

  it("单号重复被数据库的唯一索引挡住", async () => {
    const { connection, repository, service, input } = await createFixture();
    try {
      const created = await service.create(input());

      await expect(repository.insert({ ...created, id: crypto.randomUUID() })).rejects.toThrow(
        "单据号重复",
      );
    } finally {
      await connection.pool.end();
    }
  });
});
