import { atom } from "jotai";

export const documentTypeFilterAtom = atom("");

export const documentStatusFilterAtom = atom("");

export const selectedDocumentIdAtom = atom<string | null>(null);

export const documentDetailOpenAtom = atom(false);
