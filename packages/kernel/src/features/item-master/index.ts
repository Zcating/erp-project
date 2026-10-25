import { ITEM_IMPORT_COLUMNS, parseCsv, parseItemImportCsv } from "./csv.js";
import type { CsvParseResult, CsvRecord, ItemImportRow } from "./csv.js";
import { ItemBatchError, itemBatchErrorFromDetails } from "./errors.js";
import type { ItemBatchErrorDetail } from "./errors.js";
import { createInMemoryItemMasterRepository } from "./in-memory-repository.js";
import { createItemImportService } from "./import-service.js";
import type {
  ItemImportResult,
  ItemImportService,
  ItemImportServiceDeps,
} from "./import-service.js";
import {
  CONVERSION_RATE_SCALE,
  type ItemAuxiliaryUnit,
  type ItemMaster,
  type ItemMasterInput,
} from "./model.js";
import type { ItemMasterRepository } from "./ports.js";
import {
  createItemMasterService,
  type ItemBatchRow,
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
  ITEM_IMPORT_COLUMNS,
  createInMemoryItemMasterRepository,
  createItemImportService,
  createItemMasterService,
  formatConversionRate,
  itemBatchErrorFromDetails,
  parseCsv,
  parseItemImportCsv,
  validateConversionRate,
  validateItemMasterInput,
};

export {
  CONVERSION_RATE_SCALE,
  ITEM_IMPORT_COLUMNS,
  ItemBatchError,
  createInMemoryItemMasterRepository,
  createItemImportService,
  createItemMasterService,
  formatConversionRate,
  itemBatchErrorFromDetails,
  parseCsv,
  parseItemImportCsv,
  validateConversionRate,
  validateItemMasterInput,
};

export type { CsvParseResult, CsvRecord, ItemImportRow };
export type { ItemBatchErrorDetail };
export type { ItemImportResult, ItemImportService, ItemImportServiceDeps };
export type { ItemAuxiliaryUnit, ItemMaster, ItemMasterInput };
export type { ItemMasterRepository };
export type { ItemBatchRow, ItemMasterService, ItemMasterServiceOptions };
