export const UNAUTHENTICATED_ERROR_NAME = "UnauthenticatedError";
export const UNAUTHENTICATED_ERROR_PREFIX = "UNAUTHENTICATED:";

export class UnauthenticatedError extends Error {
  constructor(message = `${UNAUTHENTICATED_ERROR_PREFIX} 会话已失效，请重新登录`) {
    super(message);
    this.name = UNAUTHENTICATED_ERROR_NAME;
  }
}

export function isUnauthenticatedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === UNAUTHENTICATED_ERROR_NAME ||
    error.message.startsWith(UNAUTHENTICATED_ERROR_PREFIX)
  );
}
