// Vite config: the dev server, production build, and (via Vitest) our tests.
// Importing defineConfig from "vitest/config" instead of "vite" adds types
// for the `test` section below.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

/** Summit teal (Tailwind teal-700): the browser/OS chrome color for the installed app. */
const THEME_COLOR = "#0f766e";

/**
 * In development, requests to /api/... are forwarded to the Express server.
 * The browser then only ever talks to one origin (localhost:5173), so there
 * are no CORS rules to configure and cookies behave like in production with
 * same-site hosting. Override with API_PROXY_TARGET if the server runs elsewhere.
 */
const apiProxy = {
  "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:4000", changeOrigin: true },
};

export default defineConfig({
  // The dev server and `vite preview` both forward /api to the backend.
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  plugins: [
    // Compiles JSX and enables Fast Refresh (edits appear without losing state).
    react(),
    // Scans our files for Tailwind class names and generates only the CSS we use.
    tailwindcss(),
    // Makes the app a Progressive Web App: a manifest (so it can be installed)
    // and a service worker (so it works offline). Only active in production
    // builds; the dev server stays service-worker-free to avoid stale caches.
    VitePWA({
      // "prompt": a new version waits until the user clicks "Reload" (see
      // UpdatePrompt). "autoUpdate" would reload by itself at a random moment.
      registerType: "prompt",
      // The icons are already precached by globPatterns below; don't add
      // them a second time from the manifest.
      includeManifestIcons: false,
      manifest: {
        name: "Summit: Focus Timer",
        short_name: "Summit",
        description: "A focus timer where every focus minute climbs a real mountain.",
        theme_color: THEME_COLOR,
        background_color: "#f8fafc", // shown on the splash screen while the app loads
        display: "standalone", // its own window, without browser address bar
        start_url: "/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache (download at install time) everything the app needs to run
        // with no network: the HTML, JS, CSS, and icons.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        // Any page URL loads the app shell, so deep links work offline too.
        navigateFallback: "index.html",
        // Delete caches from older service worker versions.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    // Components need a DOM to render into; jsdom is a fake browser that runs in Node.
    environment: "jsdom",
    // Runs before every test file: adds DOM matchers and cleans up between tests.
    setupFiles: ["./src/test/setup.ts"],
    // Pin the time zone so date tests behave the same on every machine and in CI.
    env: { TZ: "UTC" },
  },
});
