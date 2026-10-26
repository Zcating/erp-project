import { POSTING_DIRECTIONS } from "./model.js";
import type { InventoryMovement, PostingDirection, PostingTypeHandler } from "./model.js";
import { createPostingService } from "./service.js";
import type { PostingService, PostingServiceOptions } from "./service.js";

export const posting = {
  POSTING_DIRECTIONS,
  createPostingService,
};

export { POSTING_DIRECTIONS, createPostingService };

export type { InventoryMovement, PostingDirection, PostingTypeHandler };
export type { PostingService, PostingServiceOptions };
