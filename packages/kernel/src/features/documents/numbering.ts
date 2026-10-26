import { DOCUMENT_NUMBER_PREFIXES, type DocumentType } from "./model.js";

export const DOCUMENT_NUMBER_SEQUENCE_WIDTH = 3;

export const DEFAULT_DOCUMENT_TIME_ZONE = "Asia/Shanghai";

export function formatDocumentDate(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}${read("month")}${read("day")}`;
}

export function formatDocumentNumber(
  type: DocumentType,
  dateKey: string,
  sequence: number,
): string {
  const prefix = DOCUMENT_NUMBER_PREFIXES[type];
  const padded = String(sequence).padStart(DOCUMENT_NUMBER_SEQUENCE_WIDTH, "0");
  return `${prefix}-${dateKey}-${padded}`;
}
