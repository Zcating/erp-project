import { Decimal } from "decimal.js";

const SPEC_WIDTH_PRECISION = 40;

const Precise = Decimal.clone({ precision: SPEC_WIDTH_PRECISION });

export const QUANTITY_SCALE = 3;
export const UNIT_PRICE_SCALE = 6;
export const AMOUNT_SCALE = 2;

declare const decimalBrand: unique symbol;

type BrandedDecimal<Kind extends string> = Decimal & { readonly [decimalBrand]: Kind };

export type Quantity = BrandedDecimal<"quantity">;
export type UnitPrice = BrandedDecimal<"unit-price">;
export type Amount = BrandedDecimal<"amount">;

function brand<Kind extends string>(value: Decimal): BrandedDecimal<Kind> {
  return value as BrandedDecimal<Kind>;
}

export function roundToScale(value: string, scale: number): Decimal {
  return new Precise(value).toDecimalPlaces(scale, Precise.ROUND_HALF_UP);
}

export function quantity(value: string): Quantity {
  return brand<"quantity">(roundToScale(value, QUANTITY_SCALE));
}

export function unitPrice(value: string): UnitPrice {
  return brand<"unit-price">(roundToScale(value, UNIT_PRICE_SCALE));
}

export function amount(value: string): Amount {
  return brand<"amount">(roundToScale(value, AMOUNT_SCALE));
}

export function amountOf(quantityValue: Quantity, unitPriceValue: UnitPrice): Amount {
  return brand<"amount">(
    quantityValue.times(unitPriceValue).toDecimalPlaces(AMOUNT_SCALE, Precise.ROUND_HALF_UP),
  );
}

export function toFixedString(value: Decimal, scale: number): string {
  return value.toFixed(scale, Precise.ROUND_HALF_UP);
}
