import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope.js";
import { UnauthenticatedError } from "../../shared/errors.js";
import type { SessionResolver } from "./session-resolver.js";

export function registerSessionRoutes(app: FastifyInstance, resolveSession: SessionResolver): void {
  app.get("/api/session", async (request) => {
    const session = await resolveSession(request);
    if (session === null) {
      throw new UnauthenticatedError();
    }
    return success({ adminId: session.adminId });
  });
}
