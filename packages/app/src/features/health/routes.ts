import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/api/health", async () => success({ status: "ok" }));
}
