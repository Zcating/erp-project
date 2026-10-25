import { itemDetailOpenAtom, itemKeywordAtom, selectedItemIdAtom } from "./ui-state";

export const itemUiStateAtoms = {
  itemKeyword: itemKeywordAtom,
  selectedItemId: selectedItemIdAtom,
  itemDetailOpen: itemDetailOpenAtom,
};

export type ItemUiStateAtoms = typeof itemUiStateAtoms;

export { itemDetailOpenAtom, itemKeywordAtom, selectedItemIdAtom };
