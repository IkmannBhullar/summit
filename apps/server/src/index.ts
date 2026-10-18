// Server entry point: validates configuration, builds the app, and starts
// listening. This is the only file that touches the network; tests import
// createApp instead.
import { METERS_PER_FOCUS_MINUTE } from "@summit/shared";
import { createApp } from "./app";
import { loadConfig } from "./config/env";

// Fail fast: exit with a clear message if the environment is incomplete.
let config;
try {
  config = loadConfig();
} catch (error) {
  console.error((error as Error).message);
  console.error("\nCopy apps/server/.env.example to apps/server/.env and fill it in.");
  process.exit(1);
}

const app = createApp({ config });

app.listen(config.port, () => {
  // Using a value from @summit/shared here proves the workspace wiring works.
  console.log(
    `Summit server listening on http://localhost:${config.port} (${METERS_PER_FOCUS_MINUTE} m per focus minute)`,
  );
});
