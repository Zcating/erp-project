import { ValidationError } from "@erp-inventory-sales/kernel";
import { AMOUNT_SCALE, amount, type Amount } from "@erp-inventory-sales/shared";

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

export function parseAmount(input: string): Amount {
  if (!DECIMAL_PATTERN.test(input)) {
    throw new ValidationError(`金额必须是十进制字符串：${input}`);
  }
  const scale = input.split(".")[1]?.length ?? 0;
  if (scale > AMOUNT_SCALE) {
    throw new ValidationError(`金额最多 ${AMOUNT_SCALE} 位小数：${input}`);
  }
  try {
    return amount(input);
  } catch {
    throw new ValidationError(`金额不是合法十进制数：${input}`);
  }
}
