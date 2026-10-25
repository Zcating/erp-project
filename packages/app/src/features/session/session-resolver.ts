import type { FastifyRequest } from "fastify";

export type AdminSession = { adminId: string };

export type SessionResolver = (request: FastifyRequest) => Promise<AdminSession | null>;

export const noSessionIssued: SessionResolver = async () => null;
