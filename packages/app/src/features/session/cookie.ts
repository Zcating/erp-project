export const SESSION_COOKIE_NAME = "erp_session";

export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function buildSessionCookieHeader(sessionId: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}
