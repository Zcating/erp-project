import type {
  Customer,
  CustomerRepository,
  Supplier,
  SupplierRepository,
  Warehouse,
  WarehouseRepository,
} from "@erp-project/kernel";
import { DuplicateError } from "@erp-project/kernel";
import type { InferSelectModel } from "drizzle-orm";
import { asc, eq } from "drizzle-orm";
import type { KernelDatabase } from "../../db/client";
import { customers, suppliers, warehouses } from "../../schema/parties";

type SupplierRecord = InferSelectModel<typeof suppliers>;
type CustomerRecord = InferSelectModel<typeof customers>;
type WarehouseRecord = InferSelectModel<typeof warehouses>;

export function createSupplierRepository(db: KernelDatabase): SupplierRepository {
  const toDomain = (row: SupplierRecord): Supplier => ({
    id: row.id,
    code: row.code,
    name: row.name,
    contact: row.contact,
  });

  return {
    async list(): Promise<Supplier[]> {
      const rows = await db.select().from(suppliers).orderBy(asc(suppliers.code));
      return rows.map(toDomain);
    },

    async findById(id: string): Promise<Supplier | null> {
      const rows = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
      return rows[0] === undefined ? null : toDomain(rows[0]);
    },

    async findByCode(code: string): Promise<Supplier | null> {
      const rows = await db.select().from(suppliers).where(eq(suppliers.code, code)).limit(1);
      return rows[0] === undefined ? null : toDomain(rows[0]);
    },

    async insert(supplier: Supplier): Promise<void> {
      try {
        await db.insert(suppliers).values({
          id: supplier.id,
          code: supplier.code,
          name: supplier.name,
          contact: supplier.contact,
        });
      } catch (error) {
        throw translateWriteError(error, "供应商", "suppliers_code_key", supplier.code);
      }
    },

    async update(supplier: Supplier): Promise<void> {
      try {
        await db
          .update(suppliers)
          .set({
            code: supplier.code,
            name: supplier.name,
            contact: supplier.contact,
          })
          .where(eq(suppliers.id, supplier.id));
      } catch (error) {
        throw translateWriteError(error, "供应商", "suppliers_code_key", supplier.code);
      }
    },

    async remove(id: string): Promise<boolean> {
      const deleted = await db
        .delete(suppliers)
        .where(eq(suppliers.id, id))
        .returning({ id: suppliers.id });
      return deleted.length > 0;
    },
  };
}

export function createCustomerRepository(db: KernelDatabase): CustomerRepository {
  const toDomain = (row: CustomerRecord): Customer => ({
    id: row.id,
    code: row.code,
    name: row.name,
    contact: row.contact,
  });

  return {
    async list(): Promise<Customer[]> {
      const rows = await db.select().from(customers).orderBy(asc(customers.code));
      return rows.map(toDomain);
    },

    async findById(id: string): Promise<Customer | null> {
      const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
      return rows[0] === undefined ? null : toDomain(rows[0]);
    },

    async findByCode(code: string): Promise<Customer | null> {
      const rows = await db.select().from(customers).where(eq(customers.code, code)).limit(1);
      return rows[0] === undefined ? null : toDomain(rows[0]);
    },

    async insert(customer: Customer): Promise<void> {
      try {
        await db.insert(customers).values({
          id: customer.id,
          code: customer.code,
          name: customer.name,
          contact: customer.contact,
        });
      } catch (error) {
        throw translateWriteError(error, "客户", "customers_code_key", customer.code);
      }
    },

    async update(customer: Customer): Promise<void> {
      try {
        await db
          .update(customers)
          .set({
            code: customer.code,
            name: customer.name,
            contact: customer.contact,
          })
          .where(eq(customers.id, customer.id));
      } catch (error) {
        throw translateWriteError(error, "客户", "customers_code_key", customer.code);
      }
    },

    async remove(id: string): Promise<boolean> {
      const deleted = await db
        .delete(customers)
        .where(eq(customers.id, id))
        .returning({ id: customers.id });
      return deleted.length > 0;
    },
  };
}

export function createWarehouseRepository(db: KernelDatabase): WarehouseRepository {
  const toDomain = (row: WarehouseRecord): Warehouse => ({
    id: row.id,
    code: row.code,
    name: row.name,
    purpose: row.purpose,
  });

  return {
    async list(): Promise<Warehouse[]> {
      const rows = await db.select().from(warehouses).orderBy(asc(warehouses.code));
      return rows.map(toDomain);
    },

    async findById(id: string): Promise<Warehouse | null> {
      const rows = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
      return rows[0] === undefined ? null : toDomain(rows[0]);
    },

    async findByCode(code: string): Promise<Warehouse | null> {
      const rows = await db.select().from(warehouses).where(eq(warehouses.code, code)).limit(1);
      return rows[0] === undefined ? null : toDomain(rows[0]);
    },

    async insert(warehouse: Warehouse): Promise<void> {
      try {
        await db.insert(warehouses).values({
          id: warehouse.id,
          code: warehouse.code,
          name: warehouse.name,
          purpose: warehouse.purpose,
        });
      } catch (error) {
        throw translateWriteError(error, "仓库", "warehouses_code_key", warehouse.code);
      }
    },

    async update(warehouse: Warehouse): Promise<void> {
      try {
        await db
          .update(warehouses)
          .set({
            code: warehouse.code,
            name: warehouse.name,
            purpose: warehouse.purpose,
          })
          .where(eq(warehouses.id, warehouse.id));
      } catch (error) {
        throw translateWriteError(error, "仓库", "warehouses_code_key", warehouse.code);
      }
    },

    async remove(id: string): Promise<boolean> {
      const deleted = await db
        .delete(warehouses)
        .where(eq(warehouses.id, id))
        .returning({ id: warehouses.id });
      return deleted.length > 0;
    },
  };
}

function translateWriteError(
  error: unknown,
  label: string,
  codeConstraint: string,
  code: string,
): unknown {
  const outer = error as { code?: unknown; constraint?: unknown; cause?: unknown } | null;
  if (outer === null || typeof outer !== "object") {
    return error;
  }
  const source =
    outer.cause !== undefined && outer.cause !== null && typeof outer.cause === "object"
      ? (outer.cause as { code?: unknown; constraint?: unknown })
      : outer;
  if (source.code === "23505") {
    if (source.constraint === codeConstraint) {
      return new DuplicateError(`${label}编码重复：${code}`);
    }
    return new DuplicateError(`${label}重复：${code}`);
  }
  return error;
}
