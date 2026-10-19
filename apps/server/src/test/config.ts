// Settings for building the app in tests (no real environment needed).
import type { Config } from "../config/env";

/**
 * The test database. Tests empty its tables constantly, so it must never be
 * your development database: globalSetup refuses any name not ending in "_test".
 * CI sets TEST_DATABASE_URL to point at its own Postgres.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://summit:summit@localhost:5434/summit_test";

export const testConfig: Config = {
  nodeEnv: "test",
  isProduction: false,
  port: 0,
  databaseUrl: TEST_DATABASE_URL,
  jwtSecret: "test-secret-that-is-at-least-32-characters-long",
  // The minimum bcrypt allows: hashing takes ~1 ms instead of ~250 ms.
  // Fine for tests, never for real passwords (the env schema requires 10+).
  bcryptRounds: 4,
};
