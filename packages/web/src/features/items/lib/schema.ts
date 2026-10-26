import { z } from "zod";

export const itemFormSchema = z.object({
  code: z.string(),
  barcode: z.string(),
  name: z.string().refine((value) => value.trim() !== "", "缺少商品名称"),
  specification: z.string(),
  brand: z.string(),
  category: z.string(),
  baseUnit: z.string().refine((value) => value.trim() !== "", "缺少基本计量单位"),
  auxiliaryUnits: z.array(
    z.object({
      unit: z.string(),
      conversionRate: z.string(),
    }),
  ),
});

export type ItemFormValues = z.infer<typeof itemFormSchema>;
