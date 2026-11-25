import type { FastifyInstance } from "fastify";
import { ports } from "@erp-project/kernel";
import { kernelPg } from "@erp-project/kernel-pg";
import { shared } from "@erp-project/shared";

export type { FastifyInstance };

export { kernelPg, ports, shared };

export { buildApp, type BuildAppOptions } from "./build-app";
