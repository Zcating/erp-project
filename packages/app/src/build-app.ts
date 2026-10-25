import Fastify, { type FastifyInstance } from "fastify";
import { registerDecimalRoutes } from "./features/decimals/index.js";
import { registerHealthRoutes } from "./features/health/index.js";
import {
  noSessionIssued,
  registerSessionRoutes,
  type SessionResolver,
} from "./features/session/index.js";
import { createRouteRegistry, registerSystemRoutes } from "./features/system/index.js";
import { registerErrorHandling } from "./shared/error-handling.js";

export type BuildAppOptions = {
  resolveSession?: SessionResolver;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify();
  const routeRegistry = createRouteRegistry();
  app.addHook("onRoute", (route) => {
    routeRegistry.routes.push({ method: String(route.method), url: route.url });
  });
  registerErrorHandling(app);
  registerHealthRoutes(app);
  registerSessionRoutes(app, options.resolveSession ?? noSessionIssued);
  registerDecimalRoutes(app);
  registerSystemRoutes(app, routeRegistry);
  return app;
}
