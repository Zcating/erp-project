import type { ItemMaster } from "./api";

export function conversionRateOf(item: ItemMaster | undefined, unit: string): string {
  if (item === undefined || unit === "" || unit === item.baseUnit) {
    return "1";
  }
  const auxiliary = item.auxiliaryUnits.find((candidate) => candidate.unit === unit);
  return auxiliary?.conversionRate ?? "1";
}
