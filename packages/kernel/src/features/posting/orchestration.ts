import type { TransactionContext } from "../../shared/transactions";
import type { Document } from "../documents";
import type {
  StockBalance,
  StockBalanceKey,
  StockLedgerEntry,
  StockLedgerRepository,
} from "../inventory";
import type { InventoryMovement, PostingDirection } from "./model";
import { reverseDocumentPostings } from "./reversal";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

export function balanceKey(key: StockBalanceKey): string {
  return `${key.warehouseId}::${key.itemId}`;
}

export function uniqueKeys(keys: StockBalanceKey[]): StockBalanceKey[] {
  const seen = new Set<string>();
  const result: StockBalanceKey[] = [];
  for (const key of keys) {
    const identifier = balanceKey(key);
    if (seen.has(identifier)) {
      continue;
    }
    seen.add(identifier);
    result.push(key);
  }
  return result;
}

export function emptyBalance(key: StockBalanceKey): StockBalance {
  return {
    warehouseId: key.warehouseId,
    itemId: key.itemId,
    quantity: EMPTY_QUANTITY,
    unitCost: EMPTY_UNIT_COST,
  };
}

export function buildLedgerEntries(
  document: Document,
  movements: InventoryMovement[],
  direction: PostingDirection,
): StockLedgerEntry[] {
  return movements.map((movement) => ({
    documentId: document.id,
    documentNo: document.documentNo,
    lineNo: movement.lineNo,
    warehouseId: movement.warehouseId,
    itemId: movement.itemId,
    direction: direction === "FORWARD" ? "POST" : "REVERSAL",
    quantityBefore: movement.quantityBefore,
    quantityAfter: movement.quantityAfter,
    costBefore: movement.costBefore,
    costAfter: movement.costAfter,
    unitPrice: movement.unitPrice,
    amount: movement.amount,
  }));
}

export async function reverseMovements(
  document: Document,
  ledger: StockLedgerRepository,
  transaction: TransactionContext | undefined,
): Promise<InventoryMovement[]> {
  const movements = await reverseDocumentPostings(document.id, ledger, transaction);
  return movements.sort((left, right) => left.lineNo - right.lineNo);
}
