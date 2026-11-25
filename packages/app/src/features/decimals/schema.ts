import { z } from "@erp-project/shared";

export const amountBodySchema = z.object({
  amount: z.string(),
});
