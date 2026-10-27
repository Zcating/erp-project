import type { PickerOption } from "@/components/ui/picker";

export function movementOrderOptions(): PickerOption[] {
  return [
    { value: "asc", label: "时间正序" },
    { value: "desc", label: "时间倒序" },
  ];
}
