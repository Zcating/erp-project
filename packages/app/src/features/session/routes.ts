import { timingSafeEqual } from "node:crypto";
import { z } from "@erp-project/shared";
import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope";
import { UnauthenticatedError } from "../../shared/errors";
import { buildSessionCookieHeader } from "./cookie";
import type { AdminCredentials } from "./credentials";
import type { SessionResolver } from "./session-resolver";
import type { SessionStore } from "./session-store";

export const LOGIN_FAILED_MESSAGE = "账号或密码不正确";

const loginBodySchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type SessionRouteDeps = {
  resolveSession: SessionResolver;
  store: SessionStore;
  credentials: AdminCredentials;
  sessionTtlMs: number;
};

export function registerSessionRoutes(app: FastifyInstance, deps: SessionRouteDeps): void {
  app.post("/api/login", async (request, reply) => {
    const body = loginBodySchema.safeParse(request.body);
    const usernameMatches = body.success && body.data.username === deps.credentials.username;
    const passwordMatches =
      body.success && secretsMatch(body.data.password, deps.credentials.password);
    if (!usernameMatches || !passwordMatches) {
      throw new UnauthenticatedError(LOGIN_FAILED_MESSAGE);
    }
    const sessionId = deps.store.create(deps.credentials.username);
    reply.header(
      "set-cookie",
      buildSessionCookieHeader(sessionId, Math.floor(deps.sessionTtlMs / 1000)),
    );
    return success({ adminId: deps.credentials.username });
  });

  app.get("/api/session", async (request) => {
    const session = await deps.resolveSession(request);
    if (session === null) {
      throw new UnauthenticatedError();
    }
    return success({ adminId: session.adminId });
  });
}

function secretsMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
