import { randomUUID } from "node:crypto";
import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amountOf,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-project/shared";
import { DOCUMENT_TYPE_CATALOG } from "../../shared/document-types";
import { StockNegativeError, ValidationError } from "../../shared/errors";
import type { TransactionContext } from "../../shared/transactions";
import type { Document } from "../documents";
import { weightedAverageUnitCost } from "../inventory";
import type {
  StockBalance,
  StockBalanceKey,
  StockLedgerEntry,
  StockLedgerRepository,
} from "../inventory";
import { reverseDocumentPostings } from "../posting";
import type {
  InventoryMovement,
  PostingDirection,
  PostingPhase,
  PostingTypeHandler,
} from "../posting";
import { assertPostingPrerequisites, POSTING_PHASE_SEQUENCES } from "../posting";
import { TRANSFER_POSTING_PHASES } from "./model";
import type { TransferInTransitRecord } from "./model";
import type { TransferInTransitRepository } from "./ports";

const EMPTY_QUANTITY = "0.000";
const EMPTY_UNIT_COST = "0.000000";

export function createTransferPostingHandler(
  ledger: StockLedgerRepository,
  inTransit: TransferInTransitRepository,
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

  const warehousesOf = (document: Document): { source: string; target: string } => {
    const source = document.sourceWarehouseId;
    const target = document.targetWarehouseId;
    if (source === null || target === null) {
      throw new ValidationError(DOCUMENT_TYPE_CATALOG.TRANSFER.missingWarehouseMessage);
    }
    if (source === target) {
      throw new ValidationError(
        `${DOCUMENT_TYPE_CATALOG.TRANSFER.label} ${document.documentNo} 的源仓与目标仓必须不同`,
      );
    }
    return { source, target };
  };

  const validateOut = (document: Document): void => {
    warehousesOf(document);
    assertPostingPrerequisites(document);
  };

  const applyOut = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const { source, target } = warehousesOf(document);
    const keys = uniqueKeys(
      document.lines.map((line) => ({ warehouseId: source, itemId: line.itemId })),
    );
    await ledger.ensureBalances(keys, transaction);
    const locked = await ledger.findBalancesForUpdate(keys, transaction);
    const balances = new Map<string, StockBalance>();
    for (const key of keys) {
      const found = locked.find(
        (balance) => balance.warehouseId === key.warehouseId && balance.itemId === key.itemId,
      );
      balances.set(balanceKey(key), found ?? emptyBalance(key));
    }

    const movements: InventoryMovement[] = [];
    const records: TransferInTransitRecord[] = [];
    for (const line of document.lines) {
      const key = { warehouseId: source, itemId: line.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const outbound = quantity(line.quantity);
      const afterQuantity = quantity(before.quantity).minus(outbound);
      if (afterQuantity.isNegative()) {
        throw new StockNegativeError(
          `${DOCUMENT_TYPE_CATALOG.TRANSFER.label} ${document.documentNo} 第 ${line.lineNo} 行调出后源仓账面库存将变为 ${toFixedString(afterQuantity, QUANTITY_SCALE)}，库存不足，禁止负库存`,
        );
      }
      const cost = unitPrice(before.unitCost);
      const afterQuantityText = toFixedString(afterQuantity, QUANTITY_SCALE);
      movements.push({
        lineNo: line.lineNo,
        warehouseId: source,
        itemId: line.itemId,
        quantityDelta: toFixedString(outbound.negated(), QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: afterQuantityText,
        costBefore: before.unitCost,
        costAfter: before.unitCost,
        unitPrice: toFixedString(cost, UNIT_PRICE_SCALE),
        amount: toFixedString(amountOf(outbound, cost), AMOUNT_SCALE),
      });
      balances.set(balanceKey(key), {
        warehouseId: source,
        itemId: line.itemId,
        quantity: afterQuantityText,
        unitCost: before.unitCost,
      });
      records.push({
        id: randomUUID(),
        documentId: document.id,
        documentNo: document.documentNo,
        lineNo: line.lineNo,
        itemId: line.itemId,
        sourceWarehouseId: source,
        targetWarehouseId: target,
        quantity: toFixedString(outbound, QUANTITY_SCALE),
        unitCost: toFixedString(cost, UNIT_PRICE_SCALE),
        status: "IN_TRANSIT",
      });
    }

    for (const balance of balances.values()) {
      await ledger.saveBalance(balance, transaction);
    }
    for (const record of records) {
      await inTransit.create(record, transaction);
    }
    return movements;
  };

  const applyIn = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const { target } = warehousesOf(document);
    const records = await inTransit.listByDocument(document.id, transaction);
    const pending = records.filter((record) => record.status === "IN_TRANSIT");
    const keys = uniqueKeys(
      pending.map((record) => ({ warehouseId: target, itemId: record.itemId })),
    );
    await ledger.ensureBalances(keys, transaction);
    const locked = await ledger.findBalancesForUpdate(keys, transaction);
    const balances = new Map<string, StockBalance>();
    for (const key of keys) {
      const found = locked.find(
        (balance) => balance.warehouseId === key.warehouseId && balance.itemId === key.itemId,
      );
      balances.set(balanceKey(key), found ?? emptyBalance(key));
    }

    const movements: InventoryMovement[] = [];
    const received: TransferInTransitRecord[] = [];
    for (const record of pending) {
      const key = { warehouseId: target, itemId: record.itemId };
      const before = balances.get(balanceKey(key)) as StockBalance;
      const incoming = quantity(record.quantity);
      const afterQuantity = quantity(before.quantity).plus(incoming);
      const afterCost = weightedAverageUnitCost(
        before.quantity,
        before.unitCost,
        record.quantity,
        record.unitCost,
      );
      const afterQuantityText = toFixedString(afterQuantity, QUANTITY_SCALE);
      movements.push({
        lineNo: record.lineNo,
        warehouseId: target,
        itemId: record.itemId,
        quantityDelta: toFixedString(incoming, QUANTITY_SCALE),
        quantityBefore: before.quantity,
        quantityAfter: afterQuantityText,
        costBefore: before.unitCost,
        costAfter: afterCost,
        unitPrice: record.unitCost,
        amount: toFixedString(amountOf(incoming, unitPrice(record.unitCost)), AMOUNT_SCALE),
      });
      balances.set(balanceKey(key), {
        warehouseId: target,
        itemId: record.itemId,
        quantity: afterQuantityText,
        unitCost: afterCost,
      });
      received.push({ ...record, quantity: EMPTY_QUANTITY, status: "RECEIVED" });
    }

    for (const balance of balances.values()) {
      await ledger.saveBalance(balance, transaction);
    }
    for (const record of received) {
      await inTransit.update(record, transaction);
    }
    return movements;
  };

  const reverse = async (
    document: Document,
    transaction?: TransactionContext,
  ): Promise<InventoryMovement[]> => {
    const movements = await reverseDocumentPostings(document.id, ledger, transaction);
    await inTransit.removeByDocument(document.id, transaction);
    const legOf = (movement: InventoryMovement): number =>
      movement.warehouseId === document.sourceWarehouseId ? 0 : 1;
    return movements.sort(
      (left, right) => left.lineNo - right.lineNo || legOf(left) - legOf(right),
    );
  };

  const isPosted = async (
    document: Document,
    phase: PostingPhase,
    transaction?: TransactionContext,
  ): Promise<boolean> => {
    const records = await inTransit.listByDocument(document.id, transaction);
    if (phase === TRANSFER_POSTING_PHASES.OUT) {
      return records.length > 0;
    }
    if (phase === TRANSFER_POSTING_PHASES.IN) {
      return records.some((record) => record.status === "RECEIVED");
    }
    return false;
  };

  const validatePhase = async (
    document: Document,
    phase: PostingPhase,
    transaction?: TransactionContext,
  ): Promise<void> => {
    if (phase === TRANSFER_POSTING_PHASES.OUT) {
      validateOut(document);
      return;
    }
    if (phase === TRANSFER_POSTING_PHASES.IN) {
      warehousesOf(document);
      const records = await inTransit.listByDocument(document.id, transaction);
      if (!records.some((record) => record.status === "IN_TRANSIT")) {
        throw new ValidationError(
          `${DOCUMENT_TYPE_CATALOG.TRANSFER.label} ${document.documentNo} 尚未调出，不能调入过账`,
        );
      }
      return;
    }
    throw new ValidationError(`${DOCUMENT_TYPE_CATALOG.TRANSFER.label}不支持的过账阶段：${phase}`);
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
    type: "TRANSFER",
    validate: async () => {
      throw new ValidationError(`${DOCUMENT_TYPE_CATALOG.TRANSFER.label}必须指定调出或调入阶段`);
    },
    applyInventory: async () => {
      throw new ValidationError(`${DOCUMENT_TYPE_CATALOG.TRANSFER.label}必须指定调出或调入阶段`);
    },
    buildLedger: async (document, movements, direction) =>
      buildLedger(document, movements, direction),
    phaseHandler: {
      phases: POSTING_PHASE_SEQUENCES.TRANSFER,
      isPosted,
      validate: validatePhase,
      apply: async (document, phase, transaction) =>
        phase === TRANSFER_POSTING_PHASES.OUT
          ? applyOut(document, transaction)
          : applyIn(document, transaction),
      reverse,
    },
  };
}
