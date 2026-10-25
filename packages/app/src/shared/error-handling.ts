import { ItemBatchError } from "@erp-inventory-sales/kernel";
import type { FastifyInstance } from "fastify";
import { failure } from "./envelope.js";
import type { ErrorDetail } from "./envelope.js";
import { httpStatusForErrorCode, INTERNAL_ERROR_CODE, isKnownErrorCode } from "./error-status.js";

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply
      .code(httpStatusForErrorCode("NOT_FOUND"))
      .send(failure("NOT_FOUND", `未注册的路径：${request.method} ${request.url}`));
  });

  app.setErrorHandler((error, _request, reply) => {
    const code = resolveErrorCode(error);
    reply
      .code(httpStatusForErrorCode(code))
      .send(failure(code, resolveMessage(error), resolveDetails(error)));
  });
}

function resolveErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; statusCode?: unknown; validation?: unknown };
    if (candidate.validation !== undefined) {
      return "VALIDATION";
    }
    if (typeof candidate.code === "string" && isKnownErrorCode(candidate.code)) {
      return candidate.code;
    }
    if (
      typeof candidate.statusCode === "number" &&
      candidate.statusCode >= 400 &&
      candidate.statusCode < 500
    ) {
      return "VALIDATION";
    }
  }
  return INTERNAL_ERROR_CODE;
}

function resolveMessage(error: unknown): string {
  if (error instanceof Error && error.message !== "") {
    return error.message;
  }
  return "内部错误";
}

function resolveDetails(error: unknown): ErrorDetail[] | undefined {
  if (error instanceof ItemBatchError) {
    return error.details.map((detail) => ({
      line: detail.line,
      code: detail.code,
      message: detail.message,
    }));
  }
  return undefined;
}
