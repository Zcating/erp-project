import { createInMemoryTransferInTransitRepository } from "./in-memory-repository";
import { TRANSFER_IN_TRANSIT_STATUSES, TRANSFER_POSTING_PHASES } from "./model";
import { createTransferPostingHandler } from "./posting";
import { createTransferQueryService } from "./service";

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
} from "./model";
export type { TransferInTransitRepository } from "./ports";
export type { TransferQueryService } from "./service";
