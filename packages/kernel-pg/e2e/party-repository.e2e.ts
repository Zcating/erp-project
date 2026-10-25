import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import { e2eDatabaseUrl } from "../src/db/config.js";
import {
  createCustomerRepository,
  createSupplierRepository,
  createWarehouseRepository,
} from "../src/features/parties/repository.js";

const uniqueCode = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

describe("端到端：供应商、客户与仓库仓储（Postgres 适配器）", () => {
  it("写入后能按 id、按编码读回，字段值与录入一致", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const suppliers = createSupplierRepository(connection.db);
    const customers = createCustomerRepository(connection.db);
    const warehouses = createWarehouseRepository(connection.db);
    try {
      const supplierCode = uniqueCode("E2E-PG-SUP");
      const customerCode = uniqueCode("E2E-PG-CUS");
      const warehouseCode = uniqueCode("E2E-PG-WH");

      await suppliers.insert({
        id: crypto.randomUUID(),
        code: supplierCode,
        name: "可口可乐（中国）饮料有限公司",
        contact: "采购部 13800000000",
      });
      await customers.insert({
        id: crypto.randomUUID(),
        code: customerCode,
        name: "杭州百货大楼",
        contact: "采购部 13900000000",
      });
      await warehouses.insert({
        id: crypto.randomUUID(),
        code: warehouseCode,
        name: "杭州总仓",
        purpose: "存放整箱饮料",
      });

      const supplier = await suppliers.findByCode(supplierCode);
      expect(supplier?.name).toBe("可口可乐（中国）饮料有限公司");
      expect(supplier?.contact).toBe("采购部 13800000000");

      const customer = await customers.findByCode(customerCode);
      expect(customer?.name).toBe("杭州百货大楼");
      expect(customer?.contact).toBe("采购部 13900000000");

      const warehouse = await warehouses.findByCode(warehouseCode);
      expect(warehouse?.name).toBe("杭州总仓");
      expect(warehouse?.purpose).toBe("存放整箱饮料");

      const byId = await warehouses.findById(warehouse?.id ?? "");
      expect(byId?.code).toBe(warehouseCode);

      const listed = await suppliers.list();
      expect(listed.find((row) => row.code === supplierCode)).toBeDefined();
    } finally {
      await connection.pool.end();
    }
  });

  it("编码重复被数据库的唯一索引挡住，错误消息指出编码重复", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const suppliers = createSupplierRepository(connection.db);
    const customers = createCustomerRepository(connection.db);
    const warehouses = createWarehouseRepository(connection.db);
    try {
      const supplierCode = uniqueCode("E2E-PG-DUP-SUP");
      const customerCode = uniqueCode("E2E-PG-DUP-CUS");
      const warehouseCode = uniqueCode("E2E-PG-DUP-WH");

      await suppliers.insert({
        id: crypto.randomUUID(),
        code: supplierCode,
        name: "可口可乐（中国）饮料有限公司",
        contact: null,
      });
      await customers.insert({
        id: crypto.randomUUID(),
        code: customerCode,
        name: "杭州百货大楼",
        contact: null,
      });
      await warehouses.insert({
        id: crypto.randomUUID(),
        code: warehouseCode,
        name: "杭州总仓",
        purpose: null,
      });

      await expect(
        suppliers.insert({
          id: crypto.randomUUID(),
          code: supplierCode,
          name: "同编码的另一家供应商",
          contact: null,
        }),
      ).rejects.toThrow("供应商编码重复");

      await expect(
        customers.insert({
          id: crypto.randomUUID(),
          code: customerCode,
          name: "同编码的另一家客户",
          contact: null,
        }),
      ).rejects.toThrow("客户编码重复");

      await expect(
        warehouses.insert({
          id: crypto.randomUUID(),
          code: warehouseCode,
          name: "同编码的另一个仓库",
          purpose: null,
        }),
      ).rejects.toThrow("仓库编码重复");
    } finally {
      await connection.pool.end();
    }
  });

  it("供应商编码与客户编码各自分域：同一个编码在两张表里都能写入", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const suppliers = createSupplierRepository(connection.db);
    const customers = createCustomerRepository(connection.db);
    try {
      const sharedCode = uniqueCode("E2E-PG-SHARED");

      await suppliers.insert({
        id: crypto.randomUUID(),
        code: sharedCode,
        name: "可口可乐（中国）饮料有限公司",
        contact: null,
      });
      await customers.insert({
        id: crypto.randomUUID(),
        code: sharedCode,
        name: "杭州百货大楼",
        contact: null,
      });

      expect((await suppliers.findByCode(sharedCode))?.name).toBe("可口可乐（中国）饮料有限公司");
      expect((await customers.findByCode(sharedCode))?.name).toBe("杭州百货大楼");
    } finally {
      await connection.pool.end();
    }
  });

  it("删除一条记录后列表里不再有它", async () => {
    const connection = createDatabase(e2eDatabaseUrl());
    const warehouses = createWarehouseRepository(connection.db);
    try {
      const code = uniqueCode("E2E-PG-DEL");
      const id = crypto.randomUUID();
      await warehouses.insert({
        id,
        code,
        name: "待删除的仓库",
        purpose: null,
      });

      const removed = await warehouses.remove(id);

      expect(removed).toBe(true);
      expect(await warehouses.findById(id)).toBeNull();
      expect(await warehouses.findByCode(code)).toBeNull();
    } finally {
      await connection.pool.end();
    }
  });
});
