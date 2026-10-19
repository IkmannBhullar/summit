// Server entry point: validates configuration, connects to the database,
// builds the app, and starts listening. This is the only file that touches
// the network; tests import createApp instead.
import { METERS_PER_FOCUS_MINUTE } from "@summit/shared";
import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { createPrismaClient } from "./db/client";

// Fail fast: exit with a clear message if the environment is incomplete.
let config;
try {
  config = loadConfig();
} catch (error) {
  console.error((error as Error).message);
  console.error("\nCopy apps/server/.env.example to apps/server/.env and fill it in.");
  process.exit(1);
}

// One database client (and connection pool) for the whole process.
const prisma = createPrismaClient(config.databaseUrl);
const app = createApp({ config, prisma });

const server = app.listen(config.port, () => {
  // Using a value from @summit/shared here proves the workspace wiring works.
  console.log(
    `Summit server listening on http://localhost:${config.port} (${METERS_PER_FOCUS_MINUTE} m per focus minute)`,
  );
});

/**
 * Graceful shutdown. Hosting platforms send SIGTERM before stopping a server
 * (e.g. during a deploy), and Ctrl+C sends SIGINT. Instead of dying mid-request:
 * stop accepting new connections, let in-flight requests finish, then close
 * the database pool.
 */
function shutdown(signal: string) {
  console.log(`${signal} received: shutting down gracefully...`);
  server.close(() => {
    prisma
      .$disconnect()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
  // If something hangs, don't wait forever.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
