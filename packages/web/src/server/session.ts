import { createServerFn } from "@tanstack/react-start";
import { fetchApi } from "./client";

export type SessionState = { authenticated: true; adminId: string } | { authenticated: false };

export type LoginOutcome =
  | { ok: true; adminId: string }
  | { ok: false; reason: "invalid-credentials" };

type SessionCookie = {
  name: string;
  value: string;
  maxAgeSeconds: number | null;
};

export const loginAdmin = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string }) => ({
    username: data.username,
    password: data.password,
  }))
  .handler(async ({ data }): Promise<LoginOutcome> => {
    const { getRequestHeader, setCookie } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/login", getRequestHeader("cookie"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: data.username, password: data.password }),
    });
    if (response.status === 401) {
      return { ok: false, reason: "invalid-credentials" };
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/login 返回 ${response.status}`);
    }
    const setCookieHeader = response.headers.get("set-cookie");
    if (setCookieHeader === null) {
      throw new Error("Fastify API /api/login 没有下发会话 cookie");
    }
    const sessionCookie = parseSessionCookie(setCookieHeader);
    setCookie(sessionCookie.name, sessionCookie.value, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      ...(sessionCookie.maxAgeSeconds === null ? {} : { maxAge: sessionCookie.maxAgeSeconds }),
    });
    const payload = (await response.json()) as { data: { adminId: string } };
    return { ok: true, adminId: payload.data.adminId };
  });

export const readSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionState> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const response = await fetchApi("/api/session", getRequestHeader("cookie"));
    if (response.status === 401) {
      return { authenticated: false };
    }
    if (!response.ok) {
      throw new Error(`Fastify API /api/session 返回 ${response.status}`);
    }
    const payload = (await response.json()) as { data: { adminId: string } };
    return { authenticated: true, adminId: payload.data.adminId };
  },
);

function parseSessionCookie(header: string): SessionCookie {
  const [pair, ...attributes] = header.split(";");
  const separator = (pair ?? "").indexOf("=");
  const name = (pair ?? "").slice(0, separator).trim();
  const value = decodeURIComponent((pair ?? "").slice(separator + 1).trim());
  let maxAgeSeconds: number | null = null;
  for (const attribute of attributes) {
    const [key, ...rest] = attribute.split("=");
    if (key?.trim().toLowerCase() !== "max-age") {
      continue;
    }
    const parsed = Number(rest.join("=").trim());
    if (Number.isFinite(parsed)) {
      maxAgeSeconds = parsed;
    }
  }
  return { name, value, maxAgeSeconds };
}
