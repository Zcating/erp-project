import { DEFAULT_POSTING_PHASE, POSTING_DIRECTIONS } from "./model.js";
import type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingTypeHandler,
} from "./model.js";
import { createPostingService } from "./service.js";
import type { PostingService, PostingServiceOptions } from "./service.js";
import { reverseDocumentPostings } from "./reversal.js";

export const posting = {
  DEFAULT_POSTING_PHASE,
  POSTING_DIRECTIONS,
  createPostingService,
  reverseDocumentPostings,
};

export { DEFAULT_POSTING_PHASE, POSTING_DIRECTIONS, createPostingService, reverseDocumentPostings };

export type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingTypeHandler,
};
export type { PostingService, PostingServiceOptions };
