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
import type { StockLedgerRepository } from "../inventory";
import { assertPostingPrerequisites, POSTING_PHASE_SEQUENCES, reverseMovements } from "../posting";
import type {
  InventoryMovement,
  PostingApplyContext,
  PostingContext,
  PostingPhase,
  PostingPhaseTypeHandler,
} from "../posting";
import { TRANSFER_POSTING_PHASES } from "./model";
import type { TransferInTransitRecord } from "./model";
import type { TransferInTransitRepository } from "./ports";

const EMPTY_QUANTITY = "0.000";

export function createTransferPostingHandler(
  _ledger: StockLedgerRepository,
  inTransit: TransferInTransitRepository,
): PostingPhaseTypeHandler {
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
    context: PostingApplyContext,
  ): Promise<InventoryMovement[]> => {
    const { source, target } = warehousesOf(document);
    await context.lockBalances(
      document.lines.map((line) => ({ warehouseId: source, itemId: line.itemId })),
    );

    const movements: InventoryMovement[] = [];
    const records: TransferInTransitRecord[] = [];
    for (const line of document.lines) {
      const key = { warehouseId: source, itemId: line.itemId };
      const before = context.balanceOf(key);
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
      await context.saveBalance({
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

    for (const record of records) {
      await inTransit.create(record, context.transaction);
    }
    return movements;
  };

  const applyIn = async (
    document: Document,
    context: PostingApplyContext,
  ): Promise<InventoryMovement[]> => {
    const { target } = warehousesOf(document);
    const records = await inTransit.listByDocument(document.id, context.transaction);
    const pending = records.filter((record) => record.status === "IN_TRANSIT");
    await context.lockBalances(
      pending.map((record) => ({ warehouseId: target, itemId: record.itemId })),
    );

    const movements: InventoryMovement[] = [];
    const received: TransferInTransitRecord[] = [];
    for (const record of pending) {
      const key = { warehouseId: target, itemId: record.itemId };
      const before = context.balanceOf(key);
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
      await context.saveBalance({
        warehouseId: target,
        itemId: record.itemId,
        quantity: afterQuantityText,
        unitCost: afterCost,
      });
      received.push({ ...record, quantity: EMPTY_QUANTITY, status: "RECEIVED" });
    }

    for (const record of received) {
      await inTransit.update(record, context.transaction);
    }
    return movements;
  };

  const reverse = async (
    document: Document,
    context: PostingContext,
  ): Promise<InventoryMovement[]> => {
    const movements = await reverseMovements(document, context.ledger, context.transaction);
    await inTransit.removeByDocument(document.id, context.transaction);
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

  return {
    type: "TRANSFER",
    phaseHandler: {
      phases: POSTING_PHASE_SEQUENCES.TRANSFER,
      policy: { saveMode: "after-loop", ensureZeroBalances: true },
      isPosted,
      validate: validatePhase,
      apply: async (document, phase, context) =>
        phase === TRANSFER_POSTING_PHASES.OUT
          ? applyOut(document, context)
          : applyIn(document, context),
      reverse,
    },
  };
}
