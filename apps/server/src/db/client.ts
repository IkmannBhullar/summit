/**
 * Creates the Prisma database client.
 *
 * Prisma 7's client is pure TypeScript and talks to Postgres through a
 * "driver adapter", here node-postgres (`pg`), which manages a pool of
 * reusable connections.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * @param databaseUrl - e.g. postgresql://user:pass@host:5432/db
 * @returns A client. Create ONE per process and reuse it: each client keeps
 *   its own connection pool, and too many pools exhaust Postgres's connection limit.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

export type { PrismaClient };
