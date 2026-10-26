import type { FastifyInstance } from "fastify";
import { UnauthenticatedError } from "../../shared/errors";
import type { SessionResolver } from "./session-resolver";

export const SESSION_FREE_ROUTES = new Set([
  "GET /api/health",
  "HEAD /api/health",
  "POST /api/login",
]);

export function registerSessionGuard(app: FastifyInstance, resolveSession: SessionResolver): void {
  app.addHook("onRequest", async (request) => {
    const routeUrl = request.routeOptions.url;
    if (routeUrl === undefined) {
      return;
    }
    if (SESSION_FREE_ROUTES.has(`${request.method} ${routeUrl}`)) {
      return;
    }
    const session = await resolveSession(request);
    if (session === null) {
      throw new UnauthenticatedError();
    }
  });
}
