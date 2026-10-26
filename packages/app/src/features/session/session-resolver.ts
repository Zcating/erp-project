import type { FastifyRequest } from "fastify";
import { readSessionCookie } from "./cookie";
import type { SessionStore } from "./session-store";

export type AdminSession = { adminId: string };

export type SessionResolver = (request: FastifyRequest) => Promise<AdminSession | null>;

export function createSessionResolver(store: SessionStore): SessionResolver {
  return async (request) => {
    const sessionId = readSessionCookie(request.headers.cookie);
    if (sessionId === undefined) {
      return null;
    }
    const record = store.find(sessionId);
    if (record === null) {
      return null;
    }
    return { adminId: record.adminId };
  };
}
