import type {
  CustomerRepository,
  ItemMasterRepository,
  SupplierRepository,
  WarehouseRepository,
} from "@erp-inventory-sales/kernel";
import {
  createCustomerService,
  createItemMasterService,
  createSupplierService,
  createWarehouseService,
} from "@erp-inventory-sales/kernel";
import {
  createCustomerRepository,
  createDatabase,
  createItemMasterRepository,
  createSupplierRepository,
  createWarehouseRepository,
  databaseUrl,
} from "@erp-inventory-sales/kernel-pg";
import type { DatabaseConnection, KernelDatabase } from "@erp-inventory-sales/kernel-pg";
import Fastify, { type FastifyInstance } from "fastify";
import { registerDecimalRoutes } from "./features/decimals/index.js";
import { registerHealthRoutes } from "./features/health/index.js";
import { registerItemMasterRoutes } from "./features/item-master/index.js";
import {
  registerCustomerRoutes,
  registerSupplierRoutes,
  registerWarehouseRoutes,
} from "./features/parties/index.js";
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
  supplierRepository?: SupplierRepository;
  customerRepository?: CustomerRepository;
  warehouseRepository?: WarehouseRepository;
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
  let connection: DatabaseConnection | undefined;
  app.addHook("onClose", async () => {
    if (connection !== undefined) {
      await connection.pool.end();
    }
  });
  const database = (): KernelDatabase => {
    if (connection === undefined) {
      connection = createDatabase(options.databaseUrl ?? databaseUrl());
    }
    return connection.db;
  };
  const itemMasterRepository =
    options.itemMasterRepository ?? createItemMasterRepository(database());
  const supplierRepository = options.supplierRepository ?? createSupplierRepository(database());
  const customerRepository = options.customerRepository ?? createCustomerRepository(database());
  const warehouseRepository = options.warehouseRepository ?? createWarehouseRepository(database());
  registerItemMasterRoutes(app, { service: createItemMasterService(itemMasterRepository) });
  registerSupplierRoutes(app, { service: createSupplierService(supplierRepository) });
  registerCustomerRoutes(app, { service: createCustomerService(customerRepository) });
  registerWarehouseRoutes(app, { service: createWarehouseService(warehouseRepository) });
  return app;
}
