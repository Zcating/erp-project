import { z } from "@erp-inventory-sales/shared";

export const itemAuxiliaryUnitBodySchema = z.object({
  unit: z.string(),
  conversionRate: z.string(),
});

export const itemMasterBodySchema = z.object({
  code: z.string().optional(),
  barcode: z.string().nullish(),
  name: z.string().optional(),
  specification: z.string().nullish(),
  brand: z.string().nullish(),
  category: z.string().nullish(),
  baseUnit: z.string().optional(),
  auxiliaryUnits: z.array(itemAuxiliaryUnitBodySchema).optional(),
});

export type ItemMasterBody = z.infer<typeof itemMasterBodySchema>;
