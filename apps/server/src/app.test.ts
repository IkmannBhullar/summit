// HTTP-level tests for the Express app.
// Supertest takes the app object, runs it on a temporary in-memory server,
// sends a real HTTP request, and lets us assert on the response.
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { testConfig } from "./test/config";

describe("GET /health", () => {
  it("responds 200 with { ok: true } as JSON", async () => {
    const res = await request(createApp({ config: testConfig })).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ ok: true });
  });

  // Guards the security tweak in createApp so it can't silently regress.
  it("does not expose the X-Powered-By header", async () => {
    const res = await request(createApp({ config: testConfig })).get("/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("unknown routes", () => {
  it("respond 404 with the standard JSON error shape", async () => {
    const res = await request(createApp({ config: testConfig })).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "No route for GET /does-not-exist" },
    });
  });
});
