export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PURCHASE_INBOUND: "采购入库单",
  SALE_OUTBOUND: "销售出库单",
  SALE_RETURN: "销售退货单",
  PURCHASE_RETURN: "采购退货单",
  STOCKTAKE: "盘点单",
  TRANSFER: "调拨单",
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  POSTED: "已过账",
  VOIDED: "已作废",
};

export const DOCUMENT_STATUS_OPTIONS = ["DRAFT", "POSTED", "VOIDED"] as const;

const QUANTITY_SCALE = 3;
const UNIT_PRICE_SCALE = 6;
const AMOUNT_SCALE = 2;
const CONVERSION_RATE_SCALE = 6;

export function computeLineAmount(
  quantityRaw: string,
  unitPriceRaw: string,
  conversionRateRaw = "1",
): string | null {
  const quantity = toScaledInteger(quantityRaw, QUANTITY_SCALE);
  const unitPrice = toScaledInteger(unitPriceRaw, UNIT_PRICE_SCALE);
  const conversionRate = toScaledInteger(conversionRateRaw, CONVERSION_RATE_SCALE);
  if (quantity === null || unitPrice === null || conversionRate === null) {
    return null;
  }
  const baseQuantity = divideHalfUp(
    quantity * conversionRate,
    10n ** BigInt(CONVERSION_RATE_SCALE),
  );
  const product = baseQuantity * unitPrice;
  const divisor = 10n ** BigInt(QUANTITY_SCALE + UNIT_PRICE_SCALE - AMOUNT_SCALE);
  return formatScaledInteger(divideHalfUp(product, divisor), AMOUNT_SCALE);
}

function toScaledInteger(raw: string, scale: number): bigint | null {
  const trimmed = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const negative = trimmed.startsWith("-");
  const [integerPart = "0", fractionPart = ""] = trimmed.replace("-", "").split(".");
  const padded = `${fractionPart}${"0".repeat(scale)}`.slice(0, scale);
  const value = BigInt(`${integerPart}${padded}`);
  return negative ? -value : value;
}

function divideHalfUp(value: bigint, divisor: bigint): bigint {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const quotient = absolute / divisor;
  const remainder = absolute % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function formatScaledInteger(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(scale + 1, "0");
  const integerPart = digits.slice(0, digits.length - scale);
  const fractionPart = scale === 0 ? "" : `.${digits.slice(digits.length - scale)}`;
  return `${negative ? "-" : ""}${integerPart}${fractionPart}`;
}
