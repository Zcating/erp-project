import { UNIT_PRICE_SCALE, quantity, toFixedString, unitPrice } from "@erp-inventory-sales/shared";

export function weightedAverageUnitCost(
  quantityBefore: string,
  costBefore: string,
  quantityIn: string,
  unitPriceIn: string,
): string {
  const before = quantity(quantityBefore);
  const cost = unitPrice(costBefore);
  const incoming = quantity(quantityIn);
  const price = unitPrice(unitPriceIn);
  if (before.isZero()) {
    return toFixedString(price, UNIT_PRICE_SCALE);
  }
  const totalQuantity = before.plus(incoming);
  const totalValue = before.times(cost).plus(incoming.times(price));
  return toFixedString(totalValue.dividedBy(totalQuantity), UNIT_PRICE_SCALE);
}
