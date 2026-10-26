import { queryOptions } from "@tanstack/react-query";
import { listCustomers, listSuppliers, listWarehouses } from "./api";

export function supplierListQueryKey() {
  return ["suppliers", "list"] as const;
}

export function supplierListQueryOptions() {
  return queryOptions({
    queryKey: supplierListQueryKey(),
    queryFn: () => listSuppliers(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function customerListQueryKey() {
  return ["customers", "list"] as const;
}

export function customerListQueryOptions() {
  return queryOptions({
    queryKey: customerListQueryKey(),
    queryFn: () => listCustomers(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function warehouseListQueryKey() {
  return ["warehouses", "list"] as const;
}

export function warehouseListQueryOptions() {
  return queryOptions({
    queryKey: warehouseListQueryKey(),
    queryFn: () => listWarehouses(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
