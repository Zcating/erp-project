import { DEFAULT_POSTING_PHASE, isPostingPhase, POSTING_DIRECTIONS, POSTING_PHASES } from "./model";
import type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingTypeHandler,
} from "./model";
import { POSTING_PHASE_SEQUENCES } from "./phases";
import { assertPostingPrerequisites, POSTING_PREREQUISITES } from "./prerequisites";
import type { PostingPrerequisite } from "./prerequisites";
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
  POSTING_PREREQUISITES,
  assertPostingPrerequisites,
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
  POSTING_PREREQUISITES,
  assertPostingPrerequisites,
  createPostingService,
  isPostingPhase,
  reverseDocumentPostings,
  sumReturned,
};

export type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingPrerequisite,
  PostingTypeHandler,
};
export type { PostingService, PostingServiceOptions };
export type { ReturnedSummary };
