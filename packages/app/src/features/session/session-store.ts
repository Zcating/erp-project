import { randomUUID } from "node:crypto";

export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type SessionRecord = {
  adminId: string;
  expiresAt: number;
};

export type SessionStore = {
  create(adminId: string): string;
  find(sessionId: string): SessionRecord | null;
  remove(sessionId: string): void;
};

export type SessionStoreOptions = {
  ttlMs: number;
  now?: () => number;
  createId?: () => string;
};

export function createSessionStore(options: SessionStoreOptions): SessionStore {
  const sessions = new Map<string, SessionRecord>();
  const now = options.now ?? (() => Date.now());
  const createId = options.createId ?? (() => randomUUID());

  return {
    create(adminId: string): string {
      const sessionId = createId();
      sessions.set(sessionId, { adminId, expiresAt: now() + options.ttlMs });
      return sessionId;
    },
    find(sessionId: string): SessionRecord | null {
      const record = sessions.get(sessionId);
      if (record === undefined) {
        return null;
      }
      if (record.expiresAt <= now()) {
        sessions.delete(sessionId);
        return null;
      }
      return record;
    },
    remove(sessionId: string): void {
      sessions.delete(sessionId);
    },
  };
}
