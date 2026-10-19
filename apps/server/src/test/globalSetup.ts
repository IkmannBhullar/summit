/**
 * Runs ONCE before all server tests (see vitest.config.ts):
 * 1. checks we're pointed at a *_test database (safety),
 * 2. creates that database if it doesn't exist,
 * 3. applies all migrations to it,
 * 4. seeds the peaks.
 * Individual tests then empty the user tables between runs (see db.ts).
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import pg from "pg";
import { seedPeaks } from "../../prisma/seed";
import { createPrismaClient } from "../db/client";
import { TEST_DATABASE_URL } from "./config";

export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const databaseName = url.pathname.slice(1);

  // Tests delete data freely. Refuse to run against anything that isn't
  // clearly a throwaway test database.
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against "${databaseName}": its name must end in "_test".`,
    );
  }

  // Connect to the built-in "postgres" database to create ours if needed.
  const admin = new pg.Client({
    connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).href,
  });
  try {
    await admin.connect();
  } catch (error) {
    // A refused connection is an AggregateError (IPv4 + IPv6 attempts) with an
    // empty message, so prefer its code, e.g. ECONNREFUSED.
    const reason = (error as { code?: string }).code ?? (error as Error).message;
    throw new Error(
      `Can't reach Postgres at ${url.host} (${reason}).\n` + "Start it with: docker compose up -d",
      // Keep the original error attached, so its full details aren't lost.
      { cause: error },
    );
  }
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      // Identifiers can't be query parameters; the name was checked above and is quoted.
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }

  // Apply migrations with the Prisma CLI, pointed at the test database.
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  const prisma = createPrismaClient(TEST_DATABASE_URL);
  try {
    await seedPeaks(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
