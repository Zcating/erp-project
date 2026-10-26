import { atom } from "jotai";

export const stockWarehouseFilterAtom = atom("");

export const stockItemFilterAtom = atom("");

export const movementDocumentNoFilterAtom = atom("");

export const movementWarehouseFilterAtom = atom("");

export const movementItemFilterAtom = atom("");

export const movementLineNoFilterAtom = atom("");

export const movementFromFilterAtom = atom("");

export const movementToFilterAtom = atom("");

export const movementOrderAtom = atom<"asc" | "desc">("asc");
