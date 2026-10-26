import { UNAUTHENTICATED_ERROR_CODE } from "./error-status";

export class UnauthenticatedError extends Error {
  readonly code = UNAUTHENTICATED_ERROR_CODE;

  constructor(message = "需要有效会话") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}
