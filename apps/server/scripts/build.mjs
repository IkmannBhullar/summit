// Production build: bundles the server into one JavaScript file that plain
// Node runs, with no TypeScript tooling needed at runtime.
//
// What goes in the bundle: our own code, and @summit/shared (a workspace
// package published as TypeScript source, which Node can't run as-is).
// What stays out: real npm packages (express, prisma, socket.io...). They're
// installed in node_modules on the server and imported from there as usual.
//
// Usage: npm run build -w apps/server   →   apps/server/dist/index.js
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const external = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
  (name) => name !== "@summit/shared",
);

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // Marking "express" external also covers subpaths like "@prisma/client/runtime/client".
  external,
  // Stack traces in production logs point at the original .ts lines.
  sourcemap: true,
  logLevel: "info",
});
