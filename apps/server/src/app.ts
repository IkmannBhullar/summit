import express, { type Express } from "express";
import type { Config } from "./config/env";
import type { PrismaClient } from "./db/client";
import { installErrorHandling } from "./middleware/errors";
import { installRequestParsing } from "./middleware/parsing";

/** Everything the app needs from outside, passed in so tests can supply their own. */
export interface AppDependencies {
  config: Config;
  /** Database client. Tests pass one connected to the test database. */
  prisma: PrismaClient;
}

/**
 * Builds the Express application without starting it.
 *
 * Keeping "build the app" separate from "listen on a port" (see index.ts)
 * lets tests hand the app straight to Supertest. Tests never open a real
 * port, so they're fast and can run in parallel without port clashes.
 *
 * Dependencies are passed in instead of read from globals, so each test can
 * build an app with exactly the settings it needs.
 */
export function createApp(_deps: AppDependencies): Express {
  const app = express();

  // Don't advertise "X-Powered-By: Express" in responses; it tells
  // attackers which framework (and possible vulnerabilities) we run.
  app.disable("x-powered-by");

  // Order matters: parse requests first, then routes, then error handling.
  installRequestParsing(app);

  // Health check: a cheap route that load balancers and hosting platforms
  // (Render, AWS) call to see whether the server is alive.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  installErrorHandling(app);
  return app;
}
