import { POSTING_PHASES } from "../posting";

export const TRANSFER_POSTING_PHASES = {
  OUT: POSTING_PHASES.OUT,
  IN: POSTING_PHASES.IN,
} as const;

export type TransferPostingPhase =
  (typeof TRANSFER_POSTING_PHASES)[keyof typeof TRANSFER_POSTING_PHASES];

export const TRANSFER_IN_TRANSIT_STATUSES = ["IN_TRANSIT", "RECEIVED"] as const;

export type TransferInTransitStatus = (typeof TRANSFER_IN_TRANSIT_STATUSES)[number];

export type TransferInTransitRecord = {
  id: string;
  documentId: string;
  documentNo: string;
  lineNo: number;
  itemId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  quantity: string;
  unitCost: string;
  status: TransferInTransitStatus;
};
