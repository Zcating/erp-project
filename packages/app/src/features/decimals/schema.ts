import { z } from "@erp-inventory-sales/shared";

export const amountBodySchema = z.object({
  amount: z.string(),
});
