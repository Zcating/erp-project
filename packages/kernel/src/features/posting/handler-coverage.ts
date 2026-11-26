import { DOCUMENT_TYPES, isDocumentType } from "../../shared/document-types";
import { DuplicateError, ValidationError } from "../../shared/errors";
import type { PostingTypeHandler } from "./model";

export function assertPostingHandlerCoverage(handlers: readonly PostingTypeHandler[]): void {
  const counts = new Map<string, number>();
  for (const handler of handlers) {
    counts.set(handler.type, (counts.get(handler.type) ?? 0) + 1);
  }

  const missing = DOCUMENT_TYPES.filter((type) => !counts.has(type));
  if (missing.length > 0) {
    throw new ValidationError(`过账 handler 缺少单据类型：${missing.join("、")}`);
  }

  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([type]) => type);
  if (duplicates.length > 0) {
    throw new DuplicateError(`过账 handler 重复注册单据类型：${duplicates.join("、")}`);
  }

  const unknown: string[] = [...counts.keys()].filter((type) => !isDocumentType(type));
  if (unknown.length > 0) {
    throw new ValidationError(`过账 handler 注册了目录外的单据类型：${unknown.join("、")}`);
  }
}
