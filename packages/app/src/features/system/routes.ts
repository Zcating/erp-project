import type { FastifyInstance } from "fastify";
import { success } from "../../shared/envelope.js";

export type RegisteredRoute = {
  method: string;
  url: string;
};

export type RouteRegistry = {
  routes: Array<RegisteredRoute>;
};

export function createRouteRegistry(): RouteRegistry {
  return { routes: [] };
}

export function registerSystemRoutes(app: FastifyInstance, registry: RouteRegistry): void {
  app.get("/api/system/routes", async () => success({ routes: registry.routes }));
}
