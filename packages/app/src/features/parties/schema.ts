import { z } from "@erp-inventory-sales/shared";

export const supplierBodySchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  contact: z.string().nullish(),
});

export const customerBodySchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  contact: z.string().nullish(),
});

export const warehouseBodySchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  purpose: z.string().nullish(),
});

export type SupplierBody = z.infer<typeof supplierBodySchema>;
export type CustomerBody = z.infer<typeof customerBodySchema>;
export type WarehouseBody = z.infer<typeof warehouseBodySchema>;
