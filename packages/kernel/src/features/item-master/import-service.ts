import type { TransactionRunner } from "../../shared/transactions/index.js";
import { parseItemImportCsv } from "./csv.js";
import type { ItemImportRow } from "./csv.js";
import type { ItemMaster } from "./model.js";
import type { ItemMasterService } from "./service.js";

export type ItemImportResult = {
  count: number;
  items: ItemMaster[];
};

export type ItemImportService = {
  importCsv(text: string): Promise<ItemImportResult>;
};

export type ItemImportServiceDeps = {
  items: ItemMasterService;
  runner: TransactionRunner;
};

export function createItemImportService(deps: ItemImportServiceDeps): ItemImportService {
  return {
    async importCsv(text: string): Promise<ItemImportResult> {
      const rows: ItemImportRow[] = parseItemImportCsv(text);
      const items = await deps.runner.run(async (context) => deps.items.createMany(rows, context));
      return { count: items.length, items };
    },
  };
}
