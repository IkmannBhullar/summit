import express, { type Express } from "express";

/**
 * Builds the Express application without starting it.
 *
 * Keeping "build the app" separate from "listen on a port" (see index.ts)
 * lets tests hand the app straight to Supertest. Tests never open a real
 * port, so they're fast and can run in parallel without port clashes.
 */
export function createApp(): Express {
  const app = express();

  // Don't advertise "X-Powered-By: Express" in responses; it tells
  // attackers which framework (and possible vulnerabilities) we run.
  app.disable("x-powered-by");

  // Health check: a cheap route that load balancers and hosting platforms
  // (Render, AWS) call to see whether the server is alive.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
