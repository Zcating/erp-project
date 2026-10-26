import {
  createInMemoryCustomerRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
} from "./in-memory-repository";
import type {
  Customer,
  CustomerInput,
  Supplier,
  SupplierInput,
  Warehouse,
  WarehouseInput,
} from "./model";
import type {
  CustomerRepository,
  PartyRepository,
  SupplierRepository,
  WarehouseRepository,
} from "./ports";
import {
  createCustomerService,
  createSupplierService,
  createWarehouseService,
  type CustomerService,
  type PartyServiceOptions,
  type SupplierService,
  type WarehouseService,
} from "./service";
import { validateCustomerInput, validateSupplierInput, validateWarehouseInput } from "./validation";

export const parties = {
  createInMemoryCustomerRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
  createCustomerService,
  createSupplierService,
  createWarehouseService,
  validateCustomerInput,
  validateSupplierInput,
  validateWarehouseInput,
};

export {
  createInMemoryCustomerRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
  createCustomerService,
  createSupplierService,
  createWarehouseService,
  validateCustomerInput,
  validateSupplierInput,
  validateWarehouseInput,
};

export type { Customer, CustomerInput, Supplier, SupplierInput, Warehouse, WarehouseInput };
export type { CustomerRepository, PartyRepository, SupplierRepository, WarehouseRepository };
export type { CustomerService, PartyServiceOptions, SupplierService, WarehouseService };
