import { customType } from "drizzle-orm/pg-core";

export type DecimalText = { data: string; driverData: string };

function toDecimalText(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

export const quantityType = customType<DecimalText>({
  dataType: () => "erp.quantity",
  fromDriver: toDecimalText,
});

export const unitPriceType = customType<DecimalText>({
  dataType: () => "erp.unit_price",
  fromDriver: toDecimalText,
});

export const amountType = customType<DecimalText>({
  dataType: () => "erp.amount",
  fromDriver: toDecimalText,
});

export const conversionRateType = customType<DecimalText>({
  dataType: () => "erp.conversion_rate",
  fromDriver: toDecimalText,
});
