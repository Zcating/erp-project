import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import type { Quantity } from "@erp-project/shared";
import { StockNegativeError, ValidationError } from "../../shared/errors";
import type { TransactionContext } from "../../shared/transactions";
import type { Document, DocumentRepository } from "../documents";
import { resolveOriginalLine } from "../documents";
import type {
  StockBalance,
  StockBalanceKey,
  StockLedgerEntry,
  StockLedgerRepository,
} from "../inventory";
import { reverseDocumentPostings, sumReturned } from "../posting";
import type { InventoryMovement, PostingDirection, PostingTypeHandler } from "../posting";
import { assertPostingPrerequisites } from "../posting";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

const ORIGINAL_LINE_WORDING = {
  prefix: "引用的原单据行",
  wrongType: "不是采购入库单的行",
};

type OriginalLineBasis = {
  documentNo: string;
  lineNo: number;
  quantity: Quantity;
};

export function createPurchaseReturnPostingHandler(
  ledger: StockLedgerRepository,
  documents: DocumentRepository,
): PostingTypeHandler {
  const balanceKey = (key: StockBalanceKey): string => `${key.warehouseId}::${key.itemId}`;

  const uniqueKeys = (keys: StockBalanceKey[]): StockBalanceKey[] => {
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
  };

  const emptyBalance = (key: StockBalanceKey): StockBalance => ({
    warehouseId: key.warehouseId,
    itemId: key.itemId,
    quantity: EMPTY_QUANTITY,
    unitCost: EMPTY_UNIT_COST,
  });

  const validate = async (
    document: Document,
    direction: PostingDirection,
    context?: TransactionContext,
  ): Promise<void> => {
    assertPostingPrerequisites(document);
    if (direction !== "FORWARD") {
      return;
    }
    for (const line of document.lines) {
      await lockOriginalDocument(line.originalLineId as string, context);
    }
  };

  const lockOriginalDocument = async (
    originalLineId: string,
    context: TransactionContext | undefined,
  ): Promise<Document> => {
    const original = await documents.findByLineIdForUpdate(originalLineId, context);
    const resolved = resolveOriginalLine(
      original,
      originalLineId,
      "PURCHASE_INBOUND",
      ORIGINAL_LINE_WORDING,
    );
    return resolved.original;
  };

  const originalLineBasisOf = async (
    originalLineId: string,
    context: TransactionContext | undefined,
  ): Promise<OriginalLineBasis> => {
    const original = await documents.findByLineId(originalLineId, context);
    const resolved = resolveOriginalLine(
      original,
      originalLineId,
      "PURCHASE_INBOUND",
      ORIGINAL_LINE_WORDING,
    );
    return {
      documentNo: resolved.original.documentNo,
      lineNo: resolved.line.lineNo,
      quantity: quantity(resolved.line.quantity),
    };
  };

  const applyForward = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const warehouseId = document.sourceWarehouseId as string;
    const keys = uniqueKeys(document.lines.map((line) => ({ warehouseId, itemId: line.itemId })));
    const locked = await ledger.findBalancesForUpdate(keys, transaction);
    const balances = new Map<string, StockBalance>();
    for (const key of keys) {
      const found = locked.find(
        (balance) => balance.warehouseId === key.warehouseId && balance.itemId === key.itemId,
      );
      balances.set(balanceKey(key), found ?? emptyBalance(key));
    }

    const bases = new Map<string, OriginalLineBasis>();
    const cumulatives = new Map<string, Quantity>();
    const movements: InventoryMovement[] = [];

    for (const line of document.lines) {
      const originalLineId = line.originalLineId as string;
      let basis = bases.get(originalLineId);
      if (basis === undefined) {
        basis = await originalLineBasisOf(originalLineId, transaction);
        bases.set(originalLineId, basis);
        const prior = await sumReturned(documents, ledger, originalLineId, transaction);
        cumulatives.set(originalLineId, prior.quantity);
      }
      const previous = cumulatives.get(originalLineId) as Quantity;
      const returned = quantity(line.quantity);
      const cumulative = previous.plus(returned);
      if (cumulative.greaterThan(basis.quantity)) {
        const excess = cumulative.minus(basis.quantity);
        throw new ValidationError(
          `采购退货单 ${document.documentNo} 第 ${line.lineNo} 行超退 ${toFixedString(excess, QUANTITY_SCALE)}：` +
            `累计退货 ${toFixedString(cumulative, QUANTITY_SCALE)} 超过原单据 ${basis.documentNo} 第 ${basis.lineNo} 行已过账数量 ${toFixedString(basis.quantity, QUANTITY_SCALE)}`,
        );
      }
      cumulatives.set(originalLineId, quantity(toFixedString(cumulative, QUANTITY_SCALE)));

      const key = { warehouseId, itemId: line.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const afterQuantity = quantity(before.quantity).minus(returned);
      if (afterQuantity.isNegative()) {
        throw new StockNegativeError(
          `采购退货单 ${document.documentNo} 第 ${line.lineNo} 行退货后账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
        );
      }
      const costUnitPrice = unitPrice(before.unitCost);
      const afterQuantityText = toFixedString(afterQuantity, QUANTITY_SCALE);
      movements.push({
        lineNo: line.lineNo,
        warehouseId,
        itemId: line.itemId,
        quantityDelta: toFixedString(returned.negated(), QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: afterQuantityText,
        costBefore: before.unitCost,
        costAfter: before.unitCost,
        unitPrice: toFixedString(costUnitPrice, UNIT_PRICE_SCALE),
        amount: toFixedString(amountOf(returned, costUnitPrice), AMOUNT_SCALE),
      });
      balances.set(balanceKey(key), {
        warehouseId,
        itemId: line.itemId,
        quantity: afterQuantityText,
        unitCost: before.unitCost,
      });
    }

    for (const balance of balances.values()) {
      await ledger.saveBalance(balance, transaction);
    }
    return movements;
  };

  const applyReverse = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const movements = await reverseDocumentPostings(document.id, ledger, transaction);
    return movements.sort((left, right) => left.lineNo - right.lineNo);
  };

  const buildLedger = async (
    document: Document,
    movements: InventoryMovement[],
    direction: PostingDirection,
  ): Promise<StockLedgerEntry[]> =>
    movements.map((movement) => ({
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

  return {
    type: "PURCHASE_RETURN",
    validate: async (document, direction, transaction) =>
      validate(document, direction, transaction),
    applyInventory: async (document, direction, transaction) =>
      direction === "FORWARD"
        ? applyForward(document, transaction)
        : applyReverse(document, transaction),
    buildLedger: async (document, movements, direction) =>
      buildLedger(document, movements, direction),
  };
}
