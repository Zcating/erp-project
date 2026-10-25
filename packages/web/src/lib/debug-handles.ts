import type { QueryClient } from "@tanstack/react-query";
import type { Store } from "jotai";
import type { ItemUiStateAtoms } from "@/features/items/stores";
import type { UiStateAtoms } from "@/features/system/stores";

export type DebugQueryEntry = {
  queryKey: readonly unknown[];
  status: string;
  data: unknown;
};

export type UiStateSnapshot = {
  routeFilter: string;
  selectedRoute: string | null;
  detailPanelOpen: boolean;
  itemKeyword: string;
  selectedItemId: string | null;
  itemDetailOpen: boolean;
};

export type DebugHandles = {
  readUiState: () => UiStateSnapshot;
  readQueryCache: () => Array<DebugQueryEntry>;
};

type DebugGlobal = typeof globalThis & {
  __erpDebug?: DebugHandles;
};

export function installDebugHandles(handles: DebugHandles): void {
  if (!import.meta.env.DEV) {
    return;
  }
  (globalThis as DebugGlobal).__erpDebug = handles;
}

export function readAtomValues(
  store: Store,
  atoms: UiStateAtoms,
  itemAtoms: ItemUiStateAtoms,
): UiStateSnapshot {
  return {
    routeFilter: store.get(atoms.routeFilter),
    selectedRoute: store.get(atoms.selectedRoute),
    detailPanelOpen: store.get(atoms.detailPanelOpen),
    itemKeyword: store.get(itemAtoms.itemKeyword),
    selectedItemId: store.get(itemAtoms.selectedItemId),
    itemDetailOpen: store.get(itemAtoms.itemDetailOpen),
  };
}

export function readQueryCache(queryClient: QueryClient): Array<DebugQueryEntry> {
  return queryClient
    .getQueryCache()
    .getAll()
    .map((query) => ({
      queryKey: query.queryKey,
      status: query.state.status,
      data: query.state.data,
    }));
}
