import type { PickerOption } from "@/components/ui/picker";
import type { Customer, Supplier, Warehouse } from "./api";

export function warehouseOptionsWithCode(warehouses: readonly Warehouse[]): PickerOption[] {
  return warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: `${warehouse.code} ${warehouse.name}`,
  }));
}

export function warehouseOptionsWithoutCode(warehouses: readonly Warehouse[]): PickerOption[] {
  return warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }));
}

export function supplierOptions(suppliers: readonly Supplier[]): PickerOption[] {
  return suppliers.map((supplier) => ({
    value: supplier.id,
    label: `${supplier.code} ${supplier.name}`,
  }));
}

export function customerOptions(customers: readonly Customer[]): PickerOption[] {
  return customers.map((customer) => ({
    value: customer.id,
    label: `${customer.code} ${customer.name}`,
  }));
}
