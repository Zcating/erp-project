export type StockBalance = {
  warehouseId: string;
  itemId: string;
  quantity: string;
  unitCost: string;
};

export const STOCK_LEDGER_DIRECTIONS = ["POST", "REVERSAL"] as const;

export type StockLedgerDirection = (typeof STOCK_LEDGER_DIRECTIONS)[number];

export type StockLedgerEntry = {
  documentId: string;
  documentNo: string;
  lineNo: number;
  warehouseId: string;
  itemId: string;
  direction: StockLedgerDirection;
  quantityBefore: string;
  quantityAfter: string;
  costBefore: string;
  costAfter: string;
  unitPrice: string;
  amount: string;
};

export type StockBalanceSummary = {
  warehouseId: string;
  itemId: string;
  onHand: string;
  available: string;
  inTransit: string;
  unitCost: string;
};

export type StockMovement = StockLedgerEntry & {
  occurredAt: string;
};

export type StockBalanceFilter = {
  warehouseId: string | null;
  itemId: string | null;
};

export type StockMovementOrder = "asc" | "desc";

export type StockMovementFilter = {
  documentNo: string | null;
  warehouseId: string | null;
  itemId: string | null;
  lineNo: number | null;
  occurredFrom: string | null;
  occurredTo: string | null;
  order: StockMovementOrder;
};
