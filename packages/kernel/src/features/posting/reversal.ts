import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  amount,
  quantity,
  toFixedString,
} from "@erp-inventory-sales/shared";
import type { TransactionContext } from "../../shared/transactions/index.js";
import { revaluedUnitCost } from "../inventory/index.js";
import type { StockBalance } from "../inventory/index.js";
import type { StockLedgerRepository } from "../inventory/index.js";
import type { InventoryMovement } from "./model.js";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

export async function reverseDocumentPostings(
  documentId: string,
  ledger: StockLedgerRepository,
  transaction: TransactionContext | undefined,
): Promise<InventoryMovement[]> {
  const entries = await ledger.listEntriesByDocument(documentId, transaction);
  const original = entries.filter((entry) => entry.direction === "POST");
  const movements: InventoryMovement[] = [];
  for (const entry of [...original].reverse()) {
    const key = { warehouseId: entry.warehouseId, itemId: entry.itemId };
    const locked = await ledger.findBalancesForUpdate([key], transaction);
    const before: StockBalance = locked[0] ?? {
      warehouseId: key.warehouseId,
      itemId: key.itemId,
      quantity: EMPTY_QUANTITY,
      unitCost: EMPTY_UNIT_COST,
    };
    const delta = quantity(entry.quantityAfter).minus(quantity(entry.quantityBefore));
    const reversalDelta = delta.negated();
    const afterQuantity = toFixedString(quantity(before.quantity).minus(delta), QUANTITY_SCALE);
    const afterCost = revaluedUnitCost(
      before.quantity,
      before.unitCost,
      afterQuantity,
      toFixedString(reversalDelta, QUANTITY_SCALE),
      entry.unitPrice,
    );
    await ledger.saveBalance(
      {
        warehouseId: key.warehouseId,
        itemId: key.itemId,
        quantity: afterQuantity,
        unitCost: afterCost,
      },
      transaction,
    );
    movements.push({
      lineNo: entry.lineNo,
      warehouseId: key.warehouseId,
      itemId: key.itemId,
      quantityDelta: toFixedString(delta.negated(), QUANTITY_SCALE),
      quantityBefore: before.quantity,
      quantityAfter: afterQuantity,
      costBefore: before.unitCost,
      costAfter: afterCost,
      unitPrice: entry.unitPrice,
      amount: toFixedString(amount(entry.amount).negated(), AMOUNT_SCALE),
    });
  }
  return movements;
}
