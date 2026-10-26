import { DEFAULT_DOCUMENT_TIME_ZONE } from "@erp-inventory-sales/kernel";

export const DOCUMENT_TIME_ZONE_ENV = "DOCUMENT_TIME_ZONE";

export function resolveDocumentTimeZone(): string {
  const configured = process.env[DOCUMENT_TIME_ZONE_ENV];
  if (configured === undefined || configured.trim() === "") {
    return DEFAULT_DOCUMENT_TIME_ZONE;
  }
  const timeZone = configured.trim();
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
  } catch {
    throw new Error(`环境变量 ${DOCUMENT_TIME_ZONE_ENV} 不是合法时区：${configured}`);
  }
  return timeZone;
}
