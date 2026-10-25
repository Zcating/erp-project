import type { ItemMasterRepository } from "@erp-inventory-sales/kernel";
import { createItemMasterService } from "@erp-inventory-sales/kernel";
import {
  createDatabase,
  createItemMasterRepository,
  databaseUrl,
} from "@erp-inventory-sales/kernel-pg";
import Fastify, { type FastifyInstance } from "fastify";
import { registerDecimalRoutes } from "./features/decimals/index.js";
import { registerHealthRoutes } from "./features/health/index.js";
import { registerItemMasterRoutes } from "./features/item-master/index.js";
import {
  createSessionResolver,
  createSessionStore,
  DEFAULT_SESSION_TTL_MS,
  registerSessionGuard,
  registerSessionRoutes,
  resolveAdminCredentials,
  type AdminCredentials,
  type SessionResolver,
} from "./features/session/index.js";
import { createRouteRegistry, registerSystemRoutes } from "./features/system/index.js";
import { registerErrorHandling } from "./shared/error-handling.js";

export type BuildAppOptions = {
  resolveSession?: SessionResolver;
  adminCredentials?: AdminCredentials;
  sessionTtlMs?: number;
  databaseUrl?: string;
  itemMasterRepository?: ItemMasterRepository;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify();
  const routeRegistry = createRouteRegistry();
  app.addHook("onRoute", (route) => {
    routeRegistry.routes.push({ method: String(route.method), url: route.url });
  });
  registerErrorHandling(app);
  const credentials = options.adminCredentials ?? resolveAdminCredentials().credentials;
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const store = createSessionStore({ ttlMs: sessionTtlMs });
  const resolveSession = options.resolveSession ?? createSessionResolver(store);
  registerSessionGuard(app, resolveSession);
  registerHealthRoutes(app);
  registerSessionRoutes(app, { resolveSession, store, credentials, sessionTtlMs });
  registerDecimalRoutes(app);
  registerSystemRoutes(app, routeRegistry);
  let itemMasterRepository = options.itemMasterRepository;
  if (itemMasterRepository === undefined) {
    const connection = createDatabase(options.databaseUrl ?? databaseUrl());
    itemMasterRepository = createItemMasterRepository(connection.db);
    app.addHook("onClose", async () => {
      await connection.pool.end();
    });
  }
  registerItemMasterRoutes(app, { service: createItemMasterService(itemMasterRepository) });
  return app;
}
