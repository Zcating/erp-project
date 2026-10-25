import {
  createInMemoryCustomerRepository,
  createInMemorySupplierRepository,
  createInMemoryWarehouseRepository,
} from "./in-memory-repository.js";
import type {
  Customer,
  CustomerInput,
  Supplier,
  SupplierInput,
  Warehouse,
  WarehouseInput,
} from "./model.js";
import type {
  CustomerRepository,
  PartyRepository,
  SupplierRepository,
  WarehouseRepository,
} from "./ports.js";
import {
  createCustomerService,
  createSupplierService,
  createWarehouseService,
  type CustomerService,
  type PartyServiceOptions,
  type SupplierService,
  type WarehouseService,
} from "./service.js";
import {
  validateCustomerInput,
  validateSupplierInput,
  validateWarehouseInput,
} from "./validation.js";

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
