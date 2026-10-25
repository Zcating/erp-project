import { createInMemoryItemMasterRepository } from "./in-memory-repository.js";
import {
  CONVERSION_RATE_SCALE,
  type ItemAuxiliaryUnit,
  type ItemMaster,
  type ItemMasterInput,
} from "./model.js";
import type { ItemMasterRepository } from "./ports.js";
import {
  createItemMasterService,
  type ItemMasterService,
  type ItemMasterServiceOptions,
} from "./service.js";
import {
  formatConversionRate,
  validateConversionRate,
  validateItemMasterInput,
} from "./validation.js";

export const itemMaster = {
  CONVERSION_RATE_SCALE,
  createInMemoryItemMasterRepository,
  createItemMasterService,
  formatConversionRate,
  validateConversionRate,
  validateItemMasterInput,
};

export {
  CONVERSION_RATE_SCALE,
  createInMemoryItemMasterRepository,
  createItemMasterService,
  formatConversionRate,
  validateConversionRate,
  validateItemMasterInput,
};

export type { ItemAuxiliaryUnit, ItemMaster, ItemMasterInput };
export type { ItemMasterRepository };
export type { ItemMasterService, ItemMasterServiceOptions };
