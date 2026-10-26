import { ValidationError } from "../../shared/errors";
import { CONVERSION_RATE_SCALE, type ItemMasterInput } from "./model";

const POSITIVE_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const ZERO_DECIMAL_PATTERN = /^0*(\.0*)?$/;

export function validateItemMasterInput(input: ItemMasterInput): void {
  if (input.code.trim() === "") {
    throw new ValidationError("缺少商品编码");
  }
  if (input.name.trim() === "") {
    throw new ValidationError("缺少商品名称");
  }
  if (input.baseUnit.trim() === "") {
    throw new ValidationError("缺少基本计量单位");
  }
  input.auxiliaryUnits.forEach((auxiliaryUnit, index) => {
    if (auxiliaryUnit.unit.trim() === "") {
      throw new ValidationError(`第 ${index + 1} 个辅助计量单位缺少单位名称`);
    }
    validateConversionRate(auxiliaryUnit.conversionRate);
  });
}

export function validateConversionRate(raw: string): void {
  if (raw.trim() === "") {
    throw new ValidationError("缺少单位换算率");
  }
  if (!POSITIVE_DECIMAL_PATTERN.test(raw) || ZERO_DECIMAL_PATTERN.test(raw)) {
    throw new ValidationError(`单位换算率必须为正数：${raw}`);
  }
  const scale = raw.split(".")[1]?.length ?? 0;
  if (scale > CONVERSION_RATE_SCALE) {
    throw new ValidationError(`单位换算率最多 ${CONVERSION_RATE_SCALE} 位小数：${raw}`);
  }
}

export function formatConversionRate(raw: string): string {
  const [integer = "0", fraction = ""] = raw.split(".");
  return `${integer}.${fraction.padEnd(CONVERSION_RATE_SCALE, "0")}`;
}
