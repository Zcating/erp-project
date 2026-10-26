import type { ItemInput } from "./api";
import type { ItemFormValues } from "./schema";

export function buildItemInput(values: ItemFormValues): ItemInput {
  return {
    code: values.code,
    barcode: values.barcode.trim() === "" ? null : values.barcode.trim(),
    name: values.name,
    specification: values.specification.trim() === "" ? null : values.specification.trim(),
    brand: values.brand.trim() === "" ? null : values.brand.trim(),
    category: values.category.trim() === "" ? null : values.category.trim(),
    baseUnit: values.baseUnit,
    auxiliaryUnits: values.auxiliaryUnits.map((auxiliaryUnit) => ({
      unit: auxiliaryUnit.unit,
      conversionRate: auxiliaryUnit.conversionRate,
    })),
  };
}
