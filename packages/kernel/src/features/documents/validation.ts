import {
  AMOUNT_SCALE,
  QUANTITY_SCALE,
  UNIT_PRICE_SCALE,
  amount,
  quantity,
  toFixedString,
  unitPrice,
} from "@erp-inventory-sales/shared";
import { ValidationError } from "../../shared/errors/index.js";
import { computeLineAmount } from "./lines.js";
import {
  isDraftDocumentType,
  type DocumentInput,
  type DocumentLineInput,
  type DraftDocumentType,
} from "./model.js";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_RULES } from "./rules.js";

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

export function assertDraftDocumentType(
  input: DocumentInput,
): asserts input is DocumentInput & { type: DraftDocumentType } {
  if (input.type.trim() === "") {
    throw new ValidationError("缺少单据类型");
  }
  if (!isDraftDocumentType(input.type)) {
    throw new ValidationError(`单据类型暂不支持创建草稿：${String(input.type)}`);
  }
}

export function validateDocumentInput(
  input: DocumentInput,
): DocumentInput & { type: DraftDocumentType } {
  assertDraftDocumentType(input);

  const rule = DOCUMENT_TYPE_RULES[input.type];

  if (rule.party === "SUPPLIER" && isBlank(input.supplierId)) {
    throw new ValidationError("缺少供应商");
  }
  if (rule.party === "CUSTOMER" && isBlank(input.customerId)) {
    throw new ValidationError("缺少客户");
  }
  if (rule.warehouses.includes("SOURCE") && isBlank(input.sourceWarehouseId)) {
    throw new ValidationError(input.type === "TRANSFER" ? "缺少源仓" : "缺少来源仓库");
  }
  if (rule.warehouses.includes("TARGET") && isBlank(input.targetWarehouseId)) {
    throw new ValidationError(input.type === "TRANSFER" ? "缺少目标仓" : "缺少目标仓库");
  }
  if (rule.warehouses.includes("COUNT") && isBlank(input.warehouseId)) {
    throw new ValidationError("缺少仓库");
  }
  if (
    input.type === "TRANSFER" &&
    input.sourceWarehouseId !== null &&
    input.targetWarehouseId !== null &&
    input.sourceWarehouseId.trim() === input.targetWarehouseId.trim()
  ) {
    throw new ValidationError("源仓与目标仓必须不同");
  }

  input.lines.forEach((line, index) => {
    validateDocumentLine(input.type, line, index + 1);
  });

  return input;
}

export function validateDocumentLine(
  type: DocumentInput["type"],
  line: DocumentLineInput,
  lineNo: number,
): void {
  if (!isDraftDocumentType(type)) {
    throw new ValidationError(`单据类型暂不支持创建草稿：${String(type)}`);
  }
  const rule = DOCUMENT_TYPE_RULES[type];

  if (isBlank(line.itemId)) {
    throw new ValidationError(`第 ${lineNo} 行缺少商品`);
  }
  const quantityRaw = line.quantity;
  assertQuantityText(quantityRaw, lineNo);
  const quantityValue = quantity(quantityRaw);
  if (rule.positiveQuantity) {
    if (!quantityValue.greaterThan(0)) {
      throw new ValidationError(`第 ${lineNo} 行数量必须大于 0：${quantityRaw}`);
    }
  } else if (quantityValue.isNegative()) {
    throw new ValidationError(`第 ${lineNo} 行实盘数量不能为负数：${quantityRaw}`);
  }

  const unitPriceRaw = line.unitPrice;
  if (!rule.priced) {
    if (hasValue(unitPriceRaw) || hasValue(line.amount)) {
      const label = type === "STOCKTAKE" ? "盘点行" : `${DOCUMENT_TYPE_LABELS[type]}行`;
      throw new ValidationError(`第 ${lineNo} 行${label}不含单价与金额`);
    }
    return;
  }

  if (!hasValue(unitPriceRaw)) {
    throw new ValidationError(`第 ${lineNo} 行缺少单价`);
  }
  assertDecimal(unitPriceRaw, "单价", lineNo, UNIT_PRICE_SCALE);
  const unitPriceValue = unitPrice(unitPriceRaw);
  if (unitPriceValue.isNegative()) {
    throw new ValidationError(`第 ${lineNo} 行单价不能为负数：${unitPriceRaw}`);
  }

  const amountRaw = line.amount;
  if (!hasValue(amountRaw)) {
    return;
  }
  assertDecimal(amountRaw, "金额", lineNo, AMOUNT_SCALE);
  if (
    toFixedString(amount(amountRaw), AMOUNT_SCALE) !== computeLineAmount(quantityRaw, unitPriceRaw)
  ) {
    throw new ValidationError(`第 ${lineNo} 行金额与数量×单价不一致：${amountRaw}`);
  }
}

export function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

export function assertQuantityText(raw: string, lineNo: number): void {
  if (isBlank(raw)) {
    throw new ValidationError(`第 ${lineNo} 行缺少数量`);
  }
  assertDecimal(raw, "数量", lineNo, QUANTITY_SCALE);
}

function hasValue(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

function assertDecimal(raw: string, label: string, lineNo: number, scale: number): void {
  if (!DECIMAL_PATTERN.test(raw.trim())) {
    throw new ValidationError(`第 ${lineNo} 行${label}不是合法十进制数：${raw}`);
  }
  const decimals = raw.trim().split(".")[1]?.length ?? 0;
  if (decimals > scale) {
    throw new ValidationError(`第 ${lineNo} 行${label}最多 ${scale} 位小数：${raw}`);
  }
}
