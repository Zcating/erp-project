import type { PickerOption } from "@/components/ui/picker";
import type { ItemMaster } from "@/features/items";
import type { Warehouse } from "@/features/parties";

export function warehouseOptions(warehouses: readonly Warehouse[]): PickerOption[] {
  return [
    { value: "", label: "全部仓库" },
    ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
  ];
}

export function itemOptions(items: readonly ItemMaster[]): PickerOption[] {
  return [
    { value: "", label: "全部商品" },
    ...items.map((item) => ({ value: item.id, label: `${item.code} ${item.name}` })),
  ];
}

export function movementOrderOptions(): PickerOption[] {
  return [
    { value: "asc", label: "时间正序" },
    { value: "desc", label: "时间倒序" },
  ];
}
