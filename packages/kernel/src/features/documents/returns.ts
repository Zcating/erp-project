import { ValidationError } from "../../shared/errors";
import type { Document, DocumentLine, DocumentType } from "./model";

export type OriginalLineWording = {
  prefix: string;
  wrongType: string;
};

export type ResolvedOriginalLine = {
  original: Document;
  line: DocumentLine;
};

export function resolveOriginalLine(
  original: Document | null,
  originalLineId: string,
  expectedType: DocumentType,
  wording: OriginalLineWording,
): ResolvedOriginalLine {
  if (original === null) {
    throw new ValidationError(`${wording.prefix}不存在：${originalLineId}`);
  }
  if (original.type !== expectedType) {
    throw new ValidationError(`${wording.prefix}${wording.wrongType}：${original.documentNo}`);
  }
  if (original.status !== "POSTED") {
    throw new ValidationError(`${wording.prefix}尚未过账：${original.documentNo}`);
  }
  const line = original.lines.find((candidate) => candidate.id === originalLineId);
  if (line === undefined) {
    throw new ValidationError(`${wording.prefix}不存在：${originalLineId}`);
  }
  return { original, line };
}
