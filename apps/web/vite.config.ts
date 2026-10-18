// Vite config: the dev server, production build, and (via Vitest) our tests.
// Importing defineConfig from "vitest/config" instead of "vite" adds types
// for the `test` section below.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    // Compiles JSX and enables Fast Refresh (edits appear without losing state).
    react(),
    // Scans our files for Tailwind class names and generates only the CSS we use.
    tailwindcss(),
  ],
  test: {
    // Components need a DOM to render into; jsdom is a fake browser that runs in Node.
    environment: "jsdom",
    // Runs before every test file: adds DOM matchers and cleans up between tests.
    setupFiles: ["./src/test/setup.ts"],
  },
});
