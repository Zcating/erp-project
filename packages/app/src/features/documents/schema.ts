import { z } from "@erp-inventory-sales/shared";

export const documentLineBodySchema = z.object({
  itemId: z.string().optional(),
  quantity: z.string().optional(),
  unitPrice: z.string().nullish(),
  amount: z.string().nullish(),
  unit: z.string().nullish(),
});

export const documentBodySchema = z.object({
  type: z.string().optional(),
  supplierId: z.string().nullish(),
  customerId: z.string().nullish(),
  sourceWarehouseId: z.string().nullish(),
  targetWarehouseId: z.string().nullish(),
  warehouseId: z.string().nullish(),
  lines: z.array(documentLineBodySchema).optional(),
});

export type DocumentBody = z.infer<typeof documentBodySchema>;
export type DocumentLineBody = z.infer<typeof documentLineBodySchema>;
