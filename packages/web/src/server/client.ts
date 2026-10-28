export const apiBaseUrl = (): string => process.env.API_BASE_URL ?? "http://localhost:3000";

export async function fetchApi(
  path: string,
  cookieHeader: string | undefined,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookieHeader !== undefined) {
    headers.set("cookie", cookieHeader);
  }
  return fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
}
