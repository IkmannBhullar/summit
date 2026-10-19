// Vitest settings for the server.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Create, migrate, and seed the test database once before all tests.
    globalSetup: ["./src/test/globalSetup.ts"],
    // Test files share one database, so run them one at a time; otherwise
    // one file could empty the tables while another is mid-test.
    fileParallelism: false,
  },
});
