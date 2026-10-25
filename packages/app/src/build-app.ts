import Fastify, { type FastifyInstance } from "fastify";
import { registerDecimalRoutes } from "./features/decimals/index.js";
import { registerHealthRoutes } from "./features/health/index.js";
import {
  noSessionIssued,
  registerSessionRoutes,
  type SessionResolver,
} from "./features/session/index.js";
import { registerErrorHandling } from "./shared/error-handling.js";

export type BuildAppOptions = {
  resolveSession?: SessionResolver;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify();
  registerErrorHandling(app);
  registerHealthRoutes(app);
  registerSessionRoutes(app, options.resolveSession ?? noSessionIssued);
  registerDecimalRoutes(app);
  return app;
}
