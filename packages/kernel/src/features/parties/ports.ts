import type { Customer, Supplier, Warehouse } from "./model";

export type PartyRepository<TRecord> = {
  list(): Promise<TRecord[]>;
  findById(id: string): Promise<TRecord | null>;
  findByCode(code: string): Promise<TRecord | null>;
  insert(record: TRecord): Promise<void>;
  update(record: TRecord): Promise<void>;
  remove(id: string): Promise<boolean>;
};

export type SupplierRepository = PartyRepository<Supplier>;
export type CustomerRepository = PartyRepository<Customer>;
export type WarehouseRepository = PartyRepository<Warehouse>;
