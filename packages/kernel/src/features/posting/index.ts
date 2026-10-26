import { DEFAULT_POSTING_PHASE, POSTING_DIRECTIONS } from "./model";
import type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingPhaseHandler,
  PostingTypeHandler,
} from "./model";
import { createPostingService } from "./service";
import type { PostingService, PostingServiceOptions } from "./service";
import { reverseDocumentPostings } from "./reversal";

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
