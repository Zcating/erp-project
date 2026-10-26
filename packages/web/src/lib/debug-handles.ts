import type { QueryClient } from "@tanstack/react-query";
import type { Store } from "jotai";
import type { DocumentUiStateAtoms } from "@/features/documents/stores";
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
  documentTypeFilter: string;
  documentStatusFilter: string;
  selectedDocumentId: string | null;
  documentDetailOpen: boolean;
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
  documentAtoms: DocumentUiStateAtoms,
): UiStateSnapshot {
  return {
    routeFilter: store.get(atoms.routeFilter),
    selectedRoute: store.get(atoms.selectedRoute),
    detailPanelOpen: store.get(atoms.detailPanelOpen),
    itemKeyword: store.get(itemAtoms.itemKeyword),
    selectedItemId: store.get(itemAtoms.selectedItemId),
    itemDetailOpen: store.get(itemAtoms.itemDetailOpen),
    documentTypeFilter: store.get(documentAtoms.documentTypeFilter),
    documentStatusFilter: store.get(documentAtoms.documentStatusFilter),
    selectedDocumentId: store.get(documentAtoms.selectedDocumentId),
    documentDetailOpen: store.get(documentAtoms.documentDetailOpen),
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
