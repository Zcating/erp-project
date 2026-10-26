import type { TransactionRunner } from "../../shared/transactions";
import { parseItemImportCsv } from "./csv";
import type { ItemImportRow } from "./csv";
import { ItemBatchError } from "./errors";
import { parseItemImportJson } from "./json";
import type { ItemMaster } from "./model";
import type { ItemMasterService } from "./service";

export type ItemImportResult = {
  count: number;
  items: ItemMaster[];
};

export type ItemImportService = {
  importCsv(text: string): Promise<ItemImportResult>;
  importJson(text: string): Promise<ItemImportResult>;
};

export type ItemImportServiceDeps = {
  items: ItemMasterService;
  runner: TransactionRunner;
};

export function createItemImportService(deps: ItemImportServiceDeps): ItemImportService {
  const runImport = async (rows: ItemImportRow[]): Promise<ItemImportResult> => {
    const items = await deps.runner.run(async (context) => deps.items.createMany(rows, context));
    return { count: items.length, items };
  };

  return {
    async importCsv(text: string): Promise<ItemImportResult> {
      return runImport(parseItemImportCsv(text));
    },

    async importJson(text: string): Promise<ItemImportResult> {
      try {
        return await runImport(parseItemImportJson(text));
      } catch (error) {
        throw withRecordNumbers(error);
      }
    },
  };
}

function withRecordNumbers(error: unknown): Error {
  if (error instanceof ItemBatchError) {
    return new ItemBatchError(
      error.message,
      error.details.map((detail) => ({
        ...detail,
        message: `第 ${detail.line} 条：${detail.message}`,
      })),
      error.code,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
