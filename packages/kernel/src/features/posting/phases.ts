import type { DocumentType } from "../../shared/document-types";
import { POSTING_PHASES } from "./model";
import type { PostingPhase } from "./model";

export const POSTING_PHASE_SEQUENCES: Record<DocumentType, readonly PostingPhase[]> = {
  PURCHASE_INBOUND: [POSTING_PHASES.DEFAULT],
  SALE_OUTBOUND: [POSTING_PHASES.DEFAULT],
  SALE_RETURN: [POSTING_PHASES.DEFAULT],
  PURCHASE_RETURN: [POSTING_PHASES.DEFAULT],
  STOCKTAKE: [POSTING_PHASES.DEFAULT],
  TRANSFER: [POSTING_PHASES.OUT, POSTING_PHASES.IN],
};
