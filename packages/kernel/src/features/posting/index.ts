import { availableDocumentActions } from "./actions";
import type { AvailableDocumentActions, AvailablePostingAction } from "./actions";
import { assertPostingHandlerCoverage } from "./handler-coverage";
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
import {
  RETURN_QUANTITY_ROUNDING,
  assertReturnWithinLimit,
  lockAndValidateOriginalLines,
  originalCostBasisOf,
  originalLineBasisOf,
  remainingReturnableQuantity,
  returnedCostAllocation,
  summarizePostedReturns,
} from "./return-eligibility";
import type {
  OriginalCostBasis,
  OriginalLineBasis,
  ReturnQuantityRounding,
  ReturnedCostAllocation,
  ReturnedSummary,
} from "./return-eligibility";
import { reverseDocumentPostings } from "./reversal";
import { createPostingService } from "./service";
import type { PostingService, PostingServiceOptions } from "./service";

export const posting = {
  DEFAULT_POSTING_PHASE,
  POSTING_DIRECTIONS,
  POSTING_PHASES,
  POSTING_PHASE_SEQUENCES,
  RETURN_QUANTITY_ROUNDING,
  assertPostingPrerequisites,
  assertReturnWithinLimit,
  availableDocumentActions,
  createPostingService,
  isPostingPhase,
  lockAndValidateOriginalLines,
  originalCostBasisOf,
  originalLineBasisOf,
  remainingReturnableQuantity,
  reverseDocumentPostings,
  returnedCostAllocation,
  summarizePostedReturns,
};

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
  balanceKey,
  buildLedgerEntries,
  createPostingService,
  emptyBalance,
  isPostingPhase,
  lockAndValidateOriginalLines,
  originalCostBasisOf,
  originalLineBasisOf,
  remainingReturnableQuantity,
  reverseDocumentPostings,
  reverseMovements,
  returnedCostAllocation,
  summarizePostedReturns,
  uniqueKeys,
};

export type {
  AvailableDocumentActions,
  AvailablePostingAction,
  InventoryMovement,
  OriginalCostBasis,
  OriginalLineBasis,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingTypeHandler,
  ReturnQuantityRounding,
  ReturnedCostAllocation,
  ReturnedSummary,
};
export type { PostingService, PostingServiceOptions };
