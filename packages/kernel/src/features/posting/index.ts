import { availableDocumentActions } from "./actions";
import type { AvailableDocumentActions, AvailablePostingAction } from "./actions";
import { assertPostingHandlerCoverage } from "./handler-coverage";
import { DEFAULT_POSTING_PHASE, isPostingPhase, POSTING_DIRECTIONS, POSTING_PHASES } from "./model";
import type {
  InventoryMovement,
  PostingApplyContext,
  PostingApplyHandler,
  PostingContext,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingPhaseTypeHandler,
  PostingTypeHandler,
} from "./model";
import { reverseMovements } from "./orchestration";
import { POSTING_PHASE_SEQUENCES } from "./phases";
import { assertPostingPrerequisites } from "./prerequisites";
import {
  RETURN_QUANTITY_ROUNDING,
  assertReturnWithinLimit,
  lockAndValidateOriginalLines,
  originalCostBasisOf,
  originalLineBasisOf,
  returnedCostAllocation,
  summarizePostedReturns,
} from "./return-eligibility";
import type { OriginalCostBasis, OriginalLineBasis, ReturnedSummary } from "./return-eligibility";
import { reverseDocumentPostings } from "./reversal";
import { createPostingService } from "./service";
import type { PostingService, PostingServiceOptions } from "./service";

export {
  DEFAULT_POSTING_PHASE,
  POSTING_DIRECTIONS,
  POSTING_PHASES,
  POSTING_PHASE_SEQUENCES,
  RETURN_QUANTITY_ROUNDING,
  assertPostingHandlerCoverage,
  assertPostingPrerequisites,
  assertReturnWithinLimit,
  availableDocumentActions,
  createPostingService,
  isPostingPhase,
  lockAndValidateOriginalLines,
  originalCostBasisOf,
  originalLineBasisOf,
  reverseDocumentPostings,
  reverseMovements,
  returnedCostAllocation,
  summarizePostedReturns,
};

export type {
  AvailableDocumentActions,
  AvailablePostingAction,
  InventoryMovement,
  OriginalCostBasis,
  OriginalLineBasis,
  PostingApplyContext,
  PostingApplyHandler,
  PostingContext,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingPhaseTypeHandler,
  PostingTypeHandler,
  ReturnedSummary,
};
export type { PostingService, PostingServiceOptions };
