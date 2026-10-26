import type {
  CustomerRepository,
  DocumentRepository,
  ItemMasterRepository,
  StockLedgerRepository,
  SupplierRepository,
  TransactionRunner,
  TransferInTransitRepository,
  WarehouseRepository,
} from "@erp-inventory-sales/kernel";
import {
  createCustomerService,
  createDocumentService,
  createInMemoryDocumentRepository,
  createInMemoryStockLedgerRepository,
  createInMemoryTransactionRunner,
  createInMemoryTransferInTransitRepository,
  createInventoryQueryService,
  createItemImportService,
  createItemMasterService,
  createPostingService,
  createPurchaseInboundPostingHandler,
  createPurchaseReturnPostingHandler,
  createSaleOutboundPostingHandler,
  createSaleReturnPostingHandler,
  createStocktakePostingHandler,
  createSupplierService,
  createTransferPostingHandler,
  createTransferQueryService,
  createWarehouseService,
} from "@erp-inventory-sales/kernel";
import {
  createCustomerRepository,
  createDatabase,
  createDocumentRepository,
  createItemMasterRepository,
  createStockLedgerRepository,
  createSupplierRepository,
  createTransactionRunner,
  createTransferInTransitRepository,
  createWarehouseRepository,
  databaseUrl,
} from "@erp-inventory-sales/kernel-pg";
import type { DatabaseConnection, KernelDatabase } from "@erp-inventory-sales/kernel-pg";
import Fastify, { type FastifyInstance } from "fastify";
import { registerDecimalRoutes } from "./features/decimals";
import { registerDocumentRoutes, resolveDocumentTimeZone } from "./features/documents";
import { registerHealthRoutes } from "./features/health";
import { registerInventoryRoutes } from "./features/inventory";
import { registerItemMasterRoutes } from "./features/item-master";
import {
  registerCustomerRoutes,
  registerSupplierRoutes,
  registerWarehouseRoutes,
} from "./features/parties";
import {
  createSessionResolver,
  createSessionStore,
  DEFAULT_SESSION_TTL_MS,
  registerSessionGuard,
  registerSessionRoutes,
  resolveAdminCredentials,
  type AdminCredentials,
  type SessionResolver,
} from "./features/session";
import { createRouteRegistry, registerSystemRoutes } from "./features/system";
import { registerErrorHandling } from "./shared/error-handling";

export type BuildAppOptions = {
  resolveSession?: SessionResolver;
  adminCredentials?: AdminCredentials;
  sessionTtlMs?: number;
  databaseUrl?: string;
  itemMasterRepository?: ItemMasterRepository;
  supplierRepository?: SupplierRepository;
  customerRepository?: CustomerRepository;
  warehouseRepository?: WarehouseRepository;
  documentRepository?: DocumentRepository;
  stockLedgerRepository?: StockLedgerRepository;
  transferInTransitRepository?: TransferInTransitRepository;
  transactionRunner?: TransactionRunner;
  documentTimeZone?: string;
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
  const transactionRunner =
    options.transactionRunner ??
    (options.itemMasterRepository === undefined
      ? createTransactionRunner(database())
      : createInMemoryTransactionRunner());
  const supplierRepository = options.supplierRepository ?? createSupplierRepository(database());
  const customerRepository = options.customerRepository ?? createCustomerRepository(database());
  const warehouseRepository = options.warehouseRepository ?? createWarehouseRepository(database());
  const documentRepository =
    options.documentRepository ??
    (options.itemMasterRepository === undefined
      ? createDocumentRepository(database())
      : createInMemoryDocumentRepository());
  const stockLedgerRepository =
    options.stockLedgerRepository ??
    (options.itemMasterRepository === undefined
      ? createStockLedgerRepository(database())
      : createInMemoryStockLedgerRepository());
  const transferInTransitRepository =
    options.transferInTransitRepository ??
    (options.itemMasterRepository === undefined
      ? createTransferInTransitRepository(database())
      : createInMemoryTransferInTransitRepository());
  const documentService = createDocumentService(documentRepository, {
    runner: transactionRunner,
    timeZone: options.documentTimeZone ?? resolveDocumentTimeZone(),
    itemLookup: itemMasterRepository,
  });
  const itemMasterService = createItemMasterService(itemMasterRepository, {
    runner: transactionRunner,
    referenceChecker: documentService,
  });
  const postingService = createPostingService({
    documents: documentRepository,
    ledger: stockLedgerRepository,
    handlers: [
      createPurchaseInboundPostingHandler(stockLedgerRepository),
      createSaleOutboundPostingHandler(stockLedgerRepository),
      createSaleReturnPostingHandler(stockLedgerRepository, documentRepository),
      createPurchaseReturnPostingHandler(stockLedgerRepository, documentRepository),
      createStocktakePostingHandler(stockLedgerRepository),
      createTransferPostingHandler(stockLedgerRepository, transferInTransitRepository),
    ],
    runner: transactionRunner,
  });
  registerItemMasterRoutes(app, {
    service: itemMasterService,
    importService: createItemImportService({ items: itemMasterService, runner: transactionRunner }),
  });
  registerDocumentRoutes(app, {
    service: documentService,
    postingService,
    transferService: createTransferQueryService(transferInTransitRepository),
  });
  registerInventoryRoutes(app, {
    service: createInventoryQueryService(stockLedgerRepository, {
      inTransit: transferInTransitRepository,
    }),
  });
  registerSupplierRoutes(app, {
    service: createSupplierService(supplierRepository, {
      referenceChecker: documentService,
    }),
  });
  registerCustomerRoutes(app, {
    service: createCustomerService(customerRepository, {
      referenceChecker: documentService,
    }),
  });
  registerWarehouseRoutes(app, {
    service: createWarehouseService(warehouseRepository, {
      referenceChecker: documentService,
    }),
  });
  return app;
}
