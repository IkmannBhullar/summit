// Tests for startup configuration.
import { describe, expect, it } from "vitest";
import { loadConfig } from "./env";

const valid = {
  DATABASE_URL: "postgresql://summit:summit@localhost:5434/summit",
  JWT_SECRET: "x".repeat(32),
};

describe("loadConfig", () => {
  it("reads a valid environment, with defaults for optional settings", () => {
    expect(loadConfig(valid)).toEqual({
      nodeEnv: "development",
      isProduction: false,
      port: 4000,
      databaseUrl: valid.DATABASE_URL,
      jwtSecret: valid.JWT_SECRET,
    });
  });

  // Env values are always strings; PORT must become a real number.
  it("converts PORT from text to a number", () => {
    expect(loadConfig({ ...valid, PORT: "8080" }).port).toBe(8080);
  });

  it("knows when it's running in production", () => {
    expect(loadConfig({ ...valid, NODE_ENV: "production" }).isProduction).toBe(true);
  });

  it("refuses to start without a database URL", () => {
    expect(() => loadConfig({ JWT_SECRET: valid.JWT_SECRET })).toThrow(/DATABASE_URL is required/);
  });

  it("refuses a database URL that isn't Postgres", () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: "mysql://localhost/x" })).toThrow(
      /DATABASE_URL must be a postgres/,
    );
  });

  // A short secret is a security bug, so it must stop the server, not just warn.
  it("refuses a JWT secret shorter than 32 characters", () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: "too-short" })).toThrow(
      /JWT_SECRET must be at least 32 characters/,
    );
  });

  it("lists every problem at once, so they can all be fixed together", () => {
    let message = "";
    try {
      loadConfig({ PORT: "not-a-port" });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/PORT/);
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/JWT_SECRET/);
  });

  // Startup errors end up in logs, and logs must never contain secrets.
  it("never includes the secret's value in error messages", () => {
    const secret = "short-but-sensitive";
    let message = "";
    try {
      loadConfig({ ...valid, JWT_SECRET: secret });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/JWT_SECRET/);
    expect(message).not.toContain(secret);
  });
});
