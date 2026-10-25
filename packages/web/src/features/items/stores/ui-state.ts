import { atom } from "jotai";

export const itemKeywordAtom = atom("");

export const selectedItemIdAtom = atom<string | null>(null);

export const itemDetailOpenAtom = atom(false);
