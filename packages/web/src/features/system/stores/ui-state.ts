import { atom } from "jotai";

export const routeFilterAtom = atom("");

export const selectedRouteAtom = atom<string | null>(null);

export const detailPanelOpenAtom = atom(false);
