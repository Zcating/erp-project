import {
  documentDetailOpenAtom,
  documentStatusFilterAtom,
  documentTypeFilterAtom,
  selectedDocumentIdAtom,
} from "./ui-state";

export const documentUiStateAtoms = {
  documentTypeFilter: documentTypeFilterAtom,
  documentStatusFilter: documentStatusFilterAtom,
  selectedDocumentId: selectedDocumentIdAtom,
  documentDetailOpen: documentDetailOpenAtom,
};

export type DocumentUiStateAtoms = typeof documentUiStateAtoms;

export {
  documentDetailOpenAtom,
  documentStatusFilterAtom,
  documentTypeFilterAtom,
  selectedDocumentIdAtom,
};
