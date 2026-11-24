import { QUANTITY_SCALE, quantity, roundToScale, toFixedString } from "@erp-project/shared";
import { ValidationError } from "../../shared/errors";
import { CONVERSION_RATE_SCALE, type ItemMaster } from "./model";

export function baseQuantityOf(item: ItemMaster, quantityText: string, unit: string): string {
  const target = unit.trim();
  if (target === "" || target === item.baseUnit.trim()) {
    return toFixedString(quantity(quantityText), QUANTITY_SCALE);
  }
  const auxiliary = item.auxiliaryUnits.find((candidate) => candidate.unit.trim() === target);
  if (auxiliary === undefined) {
    throw new ValidationError(`商品 ${item.code} 没有辅助计量单位：${target}`);
  }
  const rate = roundToScale(auxiliary.conversionRate, CONVERSION_RATE_SCALE);
  return toFixedString(quantity(quantityText).times(rate), QUANTITY_SCALE);
}
