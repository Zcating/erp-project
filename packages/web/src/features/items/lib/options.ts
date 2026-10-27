import type { PickerOption } from "@/components/ui/picker";
import type { ItemMaster } from "./api";

export function itemOptions(items: readonly ItemMaster[]): PickerOption[] {
  return items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` }));
}

export function unitNames(item: ItemMaster | undefined): string[] {
  if (item === undefined) {
    return [];
  }
  return [item.baseUnit, ...item.auxiliaryUnits.map((auxiliaryUnit) => auxiliaryUnit.unit)];
}

export function unitOptions(item: ItemMaster | undefined): PickerOption[] {
  return unitNames(item).map((unit) => ({ value: unit, label: unit }));
}
