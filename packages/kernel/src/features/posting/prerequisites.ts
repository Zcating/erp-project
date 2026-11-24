import { quantity } from "@erp-project/shared";
import { ValidationError } from "../../shared/errors";
import { DOCUMENT_TYPE_LABELS, warehouseIdOfRole } from "../documents";
import type { Document, DocumentWarehouseRole, DraftDocumentType } from "../documents";

export type PostingPrerequisite = {
  warehouses: readonly DocumentWarehouseRole[];
  missingWarehouseMessage: string;
  priceLabel: string | null;
  positiveQuantity: boolean;
  originalLine: boolean;
};

export const POSTING_PREREQUISITES: Record<DraftDocumentType, PostingPrerequisite> = {
  PURCHASE_INBOUND: {
    warehouses: ["TARGET"],
    missingWarehouseMessage: "采购入库单缺少目标仓库，不能过账",
    priceLabel: "单价",
    positiveQuantity: true,
    originalLine: false,
  },
  SALE_OUTBOUND: {
    warehouses: ["SOURCE"],
    missingWarehouseMessage: "销售出库单缺少来源仓库，不能过账",
    priceLabel: "售价",
    positiveQuantity: true,
    originalLine: false,
  },
  SALE_RETURN: {
    warehouses: ["SOURCE"],
    missingWarehouseMessage: "销售退货单缺少仓库，不能过账",
    priceLabel: null,
    positiveQuantity: true,
    originalLine: true,
  },
  PURCHASE_RETURN: {
    warehouses: ["SOURCE"],
    missingWarehouseMessage: "采购退货单缺少仓库，不能过账",
    priceLabel: null,
    positiveQuantity: true,
    originalLine: true,
  },
  STOCKTAKE: {
    warehouses: ["COUNT"],
    missingWarehouseMessage: "盘点单缺少仓库，不能过账",
    priceLabel: null,
    positiveQuantity: false,
    originalLine: false,
  },
  TRANSFER: {
    warehouses: ["SOURCE", "TARGET"],
    missingWarehouseMessage: "调拨单缺少源仓或目标仓，不能过账",
    priceLabel: null,
    positiveQuantity: true,
    originalLine: false,
  },
};

export function assertPostingPrerequisites(document: Document): void {
  const prerequisite = POSTING_PREREQUISITES[document.type];
  if (prerequisite.warehouses.some((role) => warehouseIdOfRole(document, role) === null)) {
    throw new ValidationError(prerequisite.missingWarehouseMessage);
  }
  if (document.lines.length === 0) {
    throw new ValidationError(`${DOCUMENT_TYPE_LABELS[document.type]}没有单据行，不能过账`);
  }
  for (const line of document.lines) {
    if (prerequisite.priceLabel !== null && line.unitPrice === null) {
      throw new ValidationError(`第 ${line.lineNo} 行缺少${prerequisite.priceLabel}，不能过账`);
    }
    if (prerequisite.originalLine && line.originalLineId === null) {
      throw new ValidationError(`第 ${line.lineNo} 行缺少原单据行引用，不能过账`);
    }
    if (prerequisite.positiveQuantity && !quantity(line.quantity).greaterThan(0)) {
      throw new ValidationError(`第 ${line.lineNo} 行数量必须大于 0：${line.quantity}`);
    }
  }
}
