import { createInMemoryTransferInTransitRepository } from "./in-memory-repository.js";
import { TRANSFER_IN_TRANSIT_STATUSES, TRANSFER_POSTING_PHASES } from "./model.js";
import { createTransferPostingHandler } from "./posting.js";
import { createTransferQueryService } from "./service.js";

export const transfer = {
  TRANSFER_IN_TRANSIT_STATUSES,
  TRANSFER_POSTING_PHASES,
  createInMemoryTransferInTransitRepository,
  createTransferPostingHandler,
  createTransferQueryService,
};

export {
  TRANSFER_IN_TRANSIT_STATUSES,
  TRANSFER_POSTING_PHASES,
  createInMemoryTransferInTransitRepository,
  createTransferPostingHandler,
  createTransferQueryService,
};

export type {
  TransferInTransitRecord,
  TransferInTransitStatus,
  TransferPostingPhase,
} from "./model.js";
export type { TransferInTransitRepository } from "./ports.js";
export type { TransferQueryService } from "./service.js";
