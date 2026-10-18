// Settings for building the app in tests (no real environment needed).
import type { Config } from "../config/env";

export const testConfig: Config = {
  nodeEnv: "test",
  isProduction: false,
  port: 0,
  databaseUrl: "postgresql://summit:summit@localhost:5434/summit_test",
  jwtSecret: "test-secret-that-is-at-least-32-characters-long",
};
