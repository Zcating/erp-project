import { ITEM_IMPORT_COLUMNS, parseCsv, parseItemImportCsv } from "./csv";
import type { CsvParseResult, CsvRecord, ItemImportRow } from "./csv";
import { ItemBatchError, itemBatchErrorFromDetails } from "./errors";
import type { ItemBatchErrorDetail } from "./errors";
import { createInMemoryItemMasterRepository } from "./in-memory-repository";
import { createItemImportService } from "./import-service";
import type { ItemImportResult, ItemImportService, ItemImportServiceDeps } from "./import-service";
import { ITEM_IMPORT_JSON_FIELDS, parseItemImportJson } from "./json";
import {
  CONVERSION_RATE_SCALE,
  type ItemAuxiliaryUnit,
  type ItemMaster,
  type ItemMasterInput,
} from "./model";
import type { ItemMasterRepository } from "./ports";
import { baseQuantityOf } from "./units";
import {
  createItemMasterService,
  type ItemBatchRow,
  type ItemMasterService,
  type ItemMasterServiceOptions,
} from "./service";
import {
  formatConversionRate,
  validateConversionRate,
  validateItemMasterInput,
} from "./validation";

export const itemMaster = {
  CONVERSION_RATE_SCALE,
  ITEM_IMPORT_COLUMNS,
  ITEM_IMPORT_JSON_FIELDS,
  baseQuantityOf,
  createInMemoryItemMasterRepository,
  createItemImportService,
  createItemMasterService,
  formatConversionRate,
  itemBatchErrorFromDetails,
  parseCsv,
  parseItemImportCsv,
  parseItemImportJson,
  validateConversionRate,
  validateItemMasterInput,
};

export {
  CONVERSION_RATE_SCALE,
  ITEM_IMPORT_COLUMNS,
  ITEM_IMPORT_JSON_FIELDS,
  ItemBatchError,
  baseQuantityOf,
  createInMemoryItemMasterRepository,
  createItemImportService,
  createItemMasterService,
  formatConversionRate,
  itemBatchErrorFromDetails,
  parseCsv,
  parseItemImportCsv,
  parseItemImportJson,
  validateConversionRate,
  validateItemMasterInput,
};

export type { CsvParseResult, CsvRecord, ItemImportRow };
export type { ItemBatchErrorDetail };
export type { ItemImportResult, ItemImportService, ItemImportServiceDeps };
export type { ItemAuxiliaryUnit, ItemMaster, ItemMasterInput };
export type { ItemMasterRepository };
export type { ItemBatchRow, ItemMasterService, ItemMasterServiceOptions };
