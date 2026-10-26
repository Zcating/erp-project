import type { FastifyInstance } from "fastify";
import { ports } from "@erp-inventory-sales/kernel";
import { kernelPg } from "@erp-inventory-sales/kernel-pg";
import { shared } from "@erp-inventory-sales/shared";

export type { FastifyInstance };

export { kernelPg, ports, shared };

export { buildApp, type BuildAppOptions } from "./build-app";
