import { AMOUNT_SCALE, amount, quantity, toFixedString } from "@erp-project/shared";
import type { Amount, Quantity } from "@erp-project/shared";
import type { TransactionContext } from "../../shared/transactions";
import type { DocumentRepository } from "../documents";
import type { StockLedgerRepository } from "../inventory";

export type ReturnedSummary = {
  quantity: Quantity;
  amount: Amount;
};

export async function sumReturned(
  documents: DocumentRepository,
  ledger: StockLedgerRepository,
  originalLineId: string,
  context?: TransactionContext,
): Promise<ReturnedSummary> {
  const returnedQuantity = quantity(
    await documents.sumPostedReturnedQuantity(originalLineId, context),
  );
  const references = await documents.listReturnLineReferences(originalLineId, context);
  let netAmount = amount("0");
  for (const reference of references) {
    const entries = await ledger.listEntriesByDocument(reference.documentId, context);
    for (const entry of entries) {
      if (entry.lineNo !== reference.lineNo) {
        continue;
      }
      netAmount = amount(toFixedString(netAmount.plus(amount(entry.amount)), AMOUNT_SCALE));
    }
  }
  return { quantity: returnedQuantity, amount: netAmount };
}
