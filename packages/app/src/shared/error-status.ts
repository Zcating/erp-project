import type { KernelErrorCode } from "@erp-inventory-sales/kernel";

export const UNAUTHENTICATED_ERROR_CODE = "UNAUTHENTICATED";
export const INTERNAL_ERROR_CODE = "INTERNAL";

const KERNEL_ERROR_STATUS: Record<KernelErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE: 409,
  STATE_CONFLICT: 409,
  STOCK_NEGATIVE: 409,
};

const ERROR_STATUS: Record<string, number> = {
  ...KERNEL_ERROR_STATUS,
  [UNAUTHENTICATED_ERROR_CODE]: 401,
  [INTERNAL_ERROR_CODE]: 500,
};

export function httpStatusForErrorCode(code: string): number {
  return ERROR_STATUS[code] ?? ERROR_STATUS[INTERNAL_ERROR_CODE] ?? 500;
}

export function isKnownErrorCode(code: string): boolean {
  return Object.hasOwn(ERROR_STATUS, code);
}
