import { availableDocumentActions } from "./actions";
import type { AvailableDocumentActions, AvailablePostingAction } from "./actions";
import { DEFAULT_POSTING_PHASE, isPostingPhase, POSTING_DIRECTIONS, POSTING_PHASES } from "./model";
import type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingTypeHandler,
} from "./model";
import {
  balanceKey,
  buildLedgerEntries,
  emptyBalance,
  reverseMovements,
  uniqueKeys,
} from "./orchestration";
import { POSTING_PHASE_SEQUENCES } from "./phases";
import { assertPostingPrerequisites } from "./prerequisites";
import { reverseDocumentPostings } from "./reversal";
import { sumReturned } from "./returns";
import type { ReturnedSummary } from "./returns";
import { createPostingService } from "./service";
import type { PostingService, PostingServiceOptions } from "./service";

export const posting = {
  DEFAULT_POSTING_PHASE,
  POSTING_DIRECTIONS,
  POSTING_PHASES,
  POSTING_PHASE_SEQUENCES,
  assertPostingPrerequisites,
  availableDocumentActions,
  createPostingService,
  isPostingPhase,
  reverseDocumentPostings,
  sumReturned,
};

export {
  DEFAULT_POSTING_PHASE,
  POSTING_DIRECTIONS,
  POSTING_PHASES,
  POSTING_PHASE_SEQUENCES,
  assertPostingPrerequisites,
  availableDocumentActions,
  balanceKey,
  buildLedgerEntries,
  createPostingService,
  emptyBalance,
  isPostingPhase,
  reverseDocumentPostings,
  reverseMovements,
  sumReturned,
  uniqueKeys,
};

export type {
  AvailableDocumentActions,
  AvailablePostingAction,
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingTypeHandler,
};
export type { PostingService, PostingServiceOptions };
export type { ReturnedSummary };
