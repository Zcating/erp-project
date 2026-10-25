import { ValidationError } from "@erp-inventory-sales/kernel";
import { AMOUNT_SCALE, toFixedString } from "@erp-inventory-sales/shared";
import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope.js";
import { parseAmount } from "../../shared/parse-decimal.js";
import { amountBodySchema } from "./schema.js";

export function registerDecimalRoutes(app: FastifyInstance): void {
  app.post("/api/decimals/amount", async (request) => {
    const body = amountBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError("请求体必须包含十进制字符串字段 amount");
    }
    const parsedAmount = parseAmount(body.data.amount);
    return success({ amount: toFixedString(parsedAmount, AMOUNT_SCALE) });
  });
}
