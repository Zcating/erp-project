import { UNIT_PRICE_SCALE, quantity, toFixedString, unitPrice } from "@erp-project/shared";

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

export function revaluedUnitCost(
  quantityBefore: string,
  costBefore: string,
  quantityAfter: string,
  signedQuantityDelta: string,
  unitPriceOfMovement: string,
): string {
  if (quantity(quantityAfter).isZero()) {
    return toFixedString(unitPrice("0"), UNIT_PRICE_SCALE);
  }
  return weightedAverageUnitCost(
    quantityBefore,
    costBefore,
    signedQuantityDelta,
    unitPriceOfMovement,
  );
}
