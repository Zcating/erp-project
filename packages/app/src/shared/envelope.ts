export type SuccessEnvelope<T> = { data: T };

export type ErrorDetail = { line: number; code: string; message: string };

export type ErrorEnvelope = { error: { code: string; message: string; details?: ErrorDetail[] } };

export function success<T>(data: T): SuccessEnvelope<T> {
  return { data };
}

export function failure(code: string, message: string, details?: ErrorDetail[]): ErrorEnvelope {
  if (details === undefined || details.length === 0) {
    return { error: { code, message } };
  }
  return { error: { code, message, details } };
}
