import { ITEM_IMPORT_COLUMNS } from "./csv";
import type { ItemImportRow } from "./csv";
import { ItemBatchError, itemBatchErrorFromDetails } from "./errors";
import type { ItemBatchErrorDetail } from "./errors";
import type { ItemAuxiliaryUnit, ItemMasterInput } from "./model";

export const ITEM_IMPORT_JSON_FIELDS = ITEM_IMPORT_COLUMNS;

const KNOWN_FIELDS = new Set<string>(ITEM_IMPORT_COLUMNS);

type RecordParseResult = { input: ItemMasterInput } | { problems: string[] };

export function parseItemImportJson(text: string): ItemImportRow[] {
  const document = parseDocument(text);
  if (!Array.isArray(document)) {
    throw new ItemBatchError("JSON 导入文档必须是商品对象数组", []);
  }
  if (document.length === 0) {
    throw new ItemBatchError("JSON 导入文档没有商品记录", []);
  }

  const details: ItemBatchErrorDetail[] = [];
  const rows: ItemImportRow[] = [];
  document.forEach((entry, index) => {
    const line = index + 1;
    const parsed = parseRecord(entry);
    if ("problems" in parsed) {
      details.push({
        line,
        code: "VALIDATION",
        message: parsed.problems.join("；"),
      });
      return;
    }
    rows.push({ line, input: parsed.input });
  });

  if (details.length > 0) {
    throw itemBatchErrorFromDetails(details);
  }
  return rows;
}

function parseDocument(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ItemBatchError(`JSON 解析失败：${describeParseError(error)}`, []);
  }
}

function describeParseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const position = /position (\d+)/.exec(raw);
  if (position === null) {
    return raw;
  }
  const reason = raw.replace(/\s*\(line \d+ column \d+\)/, "").replace(/\s*at position \d+/, "");
  return `位置 ${position[1]}：${reason}`;
}

function parseRecord(entry: unknown): RecordParseResult {
  if (!isPlainObject(entry)) {
    return { problems: ["必须是 JSON 对象"] };
  }

  const problems: string[] = [];
  const unknownFields = Object.keys(entry).filter((field) => !KNOWN_FIELDS.has(field));
  if (unknownFields.length > 0) {
    problems.push(`多余字段：${unknownFields.join("、")}`);
  }

  const values = new Map<string, string>();
  for (const field of ITEM_IMPORT_COLUMNS) {
    const value = toText(entry[field]);
    if (value === null) {
      problems.push(`字段 ${field} 必须是字符串`);
      continue;
    }
    values.set(field, value);
  }

  if (problems.length > 0) {
    return { problems };
  }
  return { input: toItemMasterInput(values) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return "";
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : null;
  }
  return null;
}

function toItemMasterInput(values: Map<string, string>): ItemMasterInput {
  const text = (field: string): string => values.get(field) ?? "";
  return {
    code: text("code"),
    barcode: text("barcode"),
    name: text("name"),
    specification: text("spec"),
    brand: text("brand"),
    category: text("category"),
    baseUnit: text("baseUnit"),
    auxiliaryUnits: [
      ...auxiliaryUnits(text("auxUnit1"), text("auxUnit1Rate")),
      ...auxiliaryUnits(text("auxUnit2"), text("auxUnit2Rate")),
    ],
  };
}

function auxiliaryUnits(unit: string, rate: string): ItemAuxiliaryUnit[] {
  if (unit.trim() === "" && rate.trim() === "") {
    return [];
  }
  return [{ unit, conversionRate: rate.trim() }];
}
