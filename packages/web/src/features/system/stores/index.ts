import { detailPanelOpenAtom, routeFilterAtom, selectedRouteAtom } from "./ui-state";

export const uiStateAtoms = {
  routeFilter: routeFilterAtom,
  selectedRoute: selectedRouteAtom,
  detailPanelOpen: detailPanelOpenAtom,
};

export type UiStateAtoms = typeof uiStateAtoms;

export { detailPanelOpenAtom, routeFilterAtom, selectedRouteAtom };
