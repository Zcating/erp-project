export const KERNEL_ERROR_CODES = [
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "DUPLICATE",
  "STATE_CONFLICT",
  "STOCK_NEGATIVE",
] as const;

export type KernelErrorCode = (typeof KERNEL_ERROR_CODES)[number];

export class KernelError extends Error {
  readonly code: KernelErrorCode;

  constructor(code: KernelErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ValidationError extends KernelError {
  constructor(message: string) {
    super("VALIDATION", message);
  }
}

export class NotFoundError extends KernelError {
  constructor(message: string) {
    super("NOT_FOUND", message);
  }
}

export class ConflictError extends KernelError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}

export class DuplicateError extends KernelError {
  constructor(message: string) {
    super("DUPLICATE", message);
  }
}

export class StateConflictError extends KernelError {
  constructor(message: string) {
    super("STATE_CONFLICT", message);
  }
}

export class StockNegativeError extends KernelError {
  constructor(message: string) {
    super("STOCK_NEGATIVE", message);
  }
}
