import type { PickerOption } from "@/components/ui/picker";
import type { ItemMaster } from "@/features/items";
import type { Document, DocumentLine, DraftDocumentType } from "./api";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_OPTIONS, DOCUMENT_TYPE_LABELS } from "./format";

export type OriginalLineChoice = PickerOption & {
  itemId: string;
  warehouseId: string;
};

export function documentTypeOptions(types: readonly DraftDocumentType[]): PickerOption[] {
  return types.map((type) => ({ value: type, label: DOCUMENT_TYPE_LABELS[type] ?? type }));
}

export function documentTypeFilterOptions(types: readonly DraftDocumentType[]): PickerOption[] {
  return [{ value: "", label: "全部类型" }, ...documentTypeOptions(types)];
}

export function documentStatusOptions(): PickerOption[] {
  return DOCUMENT_STATUS_OPTIONS.map((status) => ({
    value: status,
    label: DOCUMENT_STATUS_LABELS[status] ?? status,
  }));
}

export function documentStatusFilterOptions(): PickerOption[] {
  return [{ value: "", label: "全部状态" }, ...documentStatusOptions()];
}

export function originalLineLabel(
  document: Document,
  line: DocumentLine,
  items: readonly ItemMaster[],
  quantityWord: string,
): string {
  const item = items.find((candidate) => candidate.id === line.itemId);
  const itemText = item === undefined ? line.itemId : `${item.code} ${item.name}`;
  return `${document.documentNo} 第 ${line.lineNo} 行 ${itemText}（${quantityWord} ${line.quantity}）`;
}

export function originalLineChoices(
  documents: readonly Document[],
  items: readonly ItemMaster[],
  quantityWord: string,
  warehouseIdOf: (document: Document) => string,
): OriginalLineChoice[] {
  return documents.flatMap((document) =>
    document.lines.map((line) => ({
      value: line.id,
      label: originalLineLabel(document, line, items, quantityWord),
      itemId: line.itemId,
      warehouseId: warehouseIdOf(document),
    })),
  );
}
