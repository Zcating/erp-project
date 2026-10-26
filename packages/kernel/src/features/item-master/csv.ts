import { ItemBatchError, itemBatchErrorFromDetails } from "./errors";
import type { ItemBatchErrorDetail } from "./errors";
import type { ItemAuxiliaryUnit, ItemMasterInput } from "./model";

export const ITEM_IMPORT_COLUMNS = [
  "code",
  "barcode",
  "name",
  "spec",
  "brand",
  "category",
  "baseUnit",
  "auxUnit1",
  "auxUnit1Rate",
  "auxUnit2",
  "auxUnit2Rate",
] as const;

export type CsvRecord = {
  line: number;
  fields: string[];
};

export type CsvParseResult =
  | { records: CsvRecord[] }
  | { error: { line: number; message: string } };

export type ItemImportRow = {
  line: number;
  input: ItemMasterInput;
};

export function parseCsv(text: string): CsvParseResult {
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let line = 1;
  let recordLine = 1;
  let inQuotes = false;
  let quotedField = false;
  let recordHasQuotes = false;

  const pushField = (): void => {
    fields.push(field);
    field = "";
    quotedField = false;
  };

  const pushRecord = (): void => {
    pushField();
    const blank = !recordHasQuotes && fields.length === 1 && (fields[0] ?? "").trim() === "";
    if (!blank) {
      records.push({ line: recordLine, fields });
    }
    fields = [];
    recordHasQuotes = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") {
          line += 1;
        }
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field === "" && !quotedField) {
        inQuotes = true;
        quotedField = true;
        recordHasQuotes = true;
        continue;
      }
      field += '"';
      continue;
    }
    if (char === ",") {
      pushField();
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      pushRecord();
      line += 1;
      recordLine = line;
      continue;
    }
    field += char;
  }

  if (inQuotes) {
    return { error: { line: recordLine, message: "引号没有闭合" } };
  }
  if (field !== "" || fields.length > 0 || recordHasQuotes) {
    pushRecord();
  }
  return { records };
}

export function parseItemImportCsv(text: string): ItemImportRow[] {
  const parsed = parseCsv(text);
  if ("error" in parsed) {
    throw new ItemBatchError(`CSV 解析失败：${parsed.error.message}`, [
      { line: parsed.error.line, code: "VALIDATION", message: parsed.error.message },
    ]);
  }

  const records = parsed.records;
  const header = records[0];
  if (header === undefined) {
    throw new ItemBatchError("CSV 内容为空：缺少表头行", []);
  }
  assertHeaderMatches(header.fields);

  const details: ItemBatchErrorDetail[] = [];
  const rows: ItemImportRow[] = [];
  for (const record of records.slice(1)) {
    if (record.fields.length !== ITEM_IMPORT_COLUMNS.length) {
      details.push({
        line: record.line,
        code: "VALIDATION",
        message: `列数不匹配：期望 ${ITEM_IMPORT_COLUMNS.length} 列，实际 ${record.fields.length} 列`,
      });
      continue;
    }
    rows.push({ line: record.line, input: toItemMasterInput(record.fields) });
  }
  if (details.length > 0) {
    throw itemBatchErrorFromDetails(details);
  }
  if (rows.length === 0) {
    throw new ItemBatchError("CSV 没有数据行", []);
  }
  return rows;
}

function assertHeaderMatches(fields: string[]): void {
  const actual = fields.map((field) => field.trim());
  const expected: string[] = [...ITEM_IMPORT_COLUMNS];
  const missing = expected.filter((column) => !actual.includes(column));
  const extra = actual.filter((column) => !expected.includes(column));

  if (missing.length === 0 && extra.length === 0) {
    const sameOrder = actual.every((column, index) => column === expected[index]);
    if (sameOrder) {
      return;
    }
    throw new ItemBatchError(`表头不匹配：列顺序必须为 ${expected.join(",")}`, []);
  }

  const differences: string[] = [];
  if (missing.length > 0) {
    differences.push(`缺少 ${missing.join("、")}`);
  }
  if (extra.length > 0) {
    differences.push(`多出 ${extra.join("、")}`);
  }
  throw new ItemBatchError(
    `表头不匹配：${differences.join("；")}；表头必须为 ${expected.join(",")}`,
    [],
  );
}

function toItemMasterInput(fields: string[]): ItemMasterInput {
  const [
    code = "",
    barcode = "",
    name = "",
    specification = "",
    brand = "",
    category = "",
    baseUnit = "",
    auxUnit1 = "",
    auxUnit1Rate = "",
    auxUnit2 = "",
    auxUnit2Rate = "",
  ] = fields;
  return {
    code,
    barcode,
    name,
    specification,
    brand,
    category,
    baseUnit,
    auxiliaryUnits: [
      ...auxiliaryUnits(auxUnit1, auxUnit1Rate),
      ...auxiliaryUnits(auxUnit2, auxUnit2Rate),
    ],
  };
}

function auxiliaryUnits(unit: string, rate: string): ItemAuxiliaryUnit[] {
  if (unit.trim() === "" && rate.trim() === "") {
    return [];
  }
  return [{ unit, conversionRate: rate.trim() }];
}
