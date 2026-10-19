import express, { type Express } from "express";
import type { Config } from "./config/env";
import type { PrismaClient } from "./db/client";
import { createAuthMiddleware } from "./middleware/auth";
import { installErrorHandling } from "./middleware/errors";
import { installRequestParsing } from "./middleware/parsing";
import { createAuthRouter, DEFAULT_AUTH_RATE_LIMIT, type RateLimitSettings } from "./routes/auth";
import { createPasswordService } from "./services/passwords";
import { createTokenService } from "./services/tokens";

/** Everything the app needs from outside, passed in so tests can supply their own. */
export interface AppDependencies {
  config: Config;
  /** Database client. Tests pass one connected to the test database. */
  prisma: PrismaClient;
  /** Login/register attempt limits. Tests raise or lower them as needed. */
  authRateLimit?: RateLimitSettings;
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
export function createApp(deps: AppDependencies): Express {
  const { config, prisma } = deps;
  const app = express();

  // Don't advertise "X-Powered-By: Express" in responses; it tells
  // attackers which framework (and possible vulnerabilities) we run.
  app.disable("x-powered-by");

  // In production the server sits behind the hosting platform's proxy, so
  // every request seems to come from the proxy. Trusting ONE proxy hop makes
  // req.ip the real visitor's address (from X-Forwarded-For), which the rate
  // limiter needs. Locally there's no proxy, so trust nothing: otherwise
  // anyone could fake their IP with that header.
  app.set("trust proxy", config.isProduction ? 1 : false);

  const passwords = createPasswordService(config.bcryptRounds);
  const tokens = createTokenService(config.jwtSecret);
  const { authenticate, requireAuth } = createAuthMiddleware(tokens);

  // Order matters: parse requests, identify the user, then routes, then errors.
  installRequestParsing(app);
  app.use(authenticate);

  // Health check: a cheap route that load balancers and hosting platforms
  // (Render, AWS) call to see whether the server is alive.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    "/api/auth",
    createAuthRouter({
      config,
      prisma,
      passwords,
      tokens,
      requireAuth,
      rateLimit: deps.authRateLimit ?? DEFAULT_AUTH_RATE_LIMIT,
    }),
  );

  installErrorHandling(app);
  return app;
}
