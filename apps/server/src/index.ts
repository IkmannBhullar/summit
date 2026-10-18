// Server entry point: builds the app and starts listening for requests.
// This is the only file that touches the network; tests import createApp instead.
import { METERS_PER_FOCUS_MINUTE } from "@summit/shared";
import { createApp } from "./app";

// Hosting platforms tell us which port to use through the PORT env variable.
// Fall back to 4000 for local development.
const port = Number(process.env.PORT ?? 4000);

const app = createApp();

app.listen(port, () => {
  // Using a value from @summit/shared here proves the workspace wiring works.
  console.log(
    `Summit server listening on http://localhost:${port} (${METERS_PER_FOCUS_MINUTE} m per focus minute)`,
  );
});
