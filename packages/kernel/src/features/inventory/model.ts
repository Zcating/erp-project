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
