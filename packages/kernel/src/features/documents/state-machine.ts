import { StateConflictError } from "../../shared/errors/index.js";
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "./model.js";

export const DOCUMENT_STATUS_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  DRAFT: ["POSTED"],
  POSTED: ["VOIDED"],
  VOIDED: [],
};

export function canTransitionDocumentStatus(from: DocumentStatus, to: DocumentStatus): boolean {
  return DOCUMENT_STATUS_TRANSITIONS[from].includes(to);
}

export function assertDocumentStatusTransition(from: DocumentStatus, to: DocumentStatus): void {
  if (!canTransitionDocumentStatus(from, to)) {
    throw new StateConflictError(
      `单据状态不能从${DOCUMENT_STATUS_LABELS[from]}变为${DOCUMENT_STATUS_LABELS[to]}`,
    );
  }
}

export function assertDocumentIsDraft(status: DocumentStatus, documentNo: string): void {
  if (status !== "DRAFT") {
    throw new StateConflictError(
      `单据不是${DOCUMENT_STATUS_LABELS.DRAFT}状态，不能修改或删除：${documentNo}`,
    );
  }
}
