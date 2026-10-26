import { ValidationError } from "../../shared/errors";
import type { CustomerInput, SupplierInput, WarehouseInput } from "./model";

export function validateSupplierInput(input: SupplierInput): void {
  validatePartyInput(input, "供应商");
}

export function validateCustomerInput(input: CustomerInput): void {
  validatePartyInput(input, "客户");
}

export function validateWarehouseInput(input: WarehouseInput): void {
  validatePartyInput(input, "仓库");
}

function validatePartyInput(input: { code: string; name: string }, label: string): void {
  if (input.code.trim() === "") {
    throw new ValidationError(`缺少${label}编码`);
  }
  if (input.name.trim() === "") {
    throw new ValidationError(`缺少${label}名称`);
  }
}
