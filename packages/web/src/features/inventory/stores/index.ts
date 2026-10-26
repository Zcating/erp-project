import {
  movementDocumentNoFilterAtom,
  movementFromFilterAtom,
  movementItemFilterAtom,
  movementLineNoFilterAtom,
  movementOrderAtom,
  movementToFilterAtom,
  movementWarehouseFilterAtom,
  stockItemFilterAtom,
  stockWarehouseFilterAtom,
} from "./ui-state";

export const inventoryUiStateAtoms = {
  stockWarehouseFilter: stockWarehouseFilterAtom,
  stockItemFilter: stockItemFilterAtom,
  movementDocumentNoFilter: movementDocumentNoFilterAtom,
  movementWarehouseFilter: movementWarehouseFilterAtom,
  movementItemFilter: movementItemFilterAtom,
  movementLineNoFilter: movementLineNoFilterAtom,
  movementFromFilter: movementFromFilterAtom,
  movementToFilter: movementToFilterAtom,
  movementOrder: movementOrderAtom,
};

export type InventoryUiStateAtoms = typeof inventoryUiStateAtoms;

export {
  movementDocumentNoFilterAtom,
  movementFromFilterAtom,
  movementItemFilterAtom,
  movementLineNoFilterAtom,
  movementOrderAtom,
  movementToFilterAtom,
  movementWarehouseFilterAtom,
  stockItemFilterAtom,
  stockWarehouseFilterAtom,
};
