# Architecture Decision Log

A short record of the important technical decisions in Summit: what we chose,
why, and what else we considered. New entries go at the bottom. If a decision
is later reversed, add a new entry that supersedes the old one; don't edit
history.

Each entry: **Decision** · **Why** · **Alternatives considered**.

---

## 001 — Monorepo with npm workspaces

_2026-10-17 · Phase 0_

**Decision:** Keep the web app, the server, and the shared code in one Git
repository, organized as npm workspaces: `apps/web`, `apps/server`,
`packages/shared`.

**Why:**

- The client and server share types, Zod schemas, and game rules (e.g. meters
  per focus minute). In one repo, `packages/shared` is imported directly, so a
  change to a shared type immediately shows type errors on both sides.
- One pull request can change the API and the UI together, and one CI run tests
  both.
- npm workspaces come with npm, so there's no extra tool to learn or install.

**Alternatives considered:**

- _Separate repos per app:_ shared code would have to be published as an npm
  package and versioned; changes that span client and server need several
  coordinated PRs. Too much overhead for a small team.
- _pnpm workspaces / Turborepo / Nx:_ faster installs and task caching, but
  more tooling to understand. Worth revisiting if CI gets slow.

---

## 002 — Consume `packages/shared` as TypeScript source (no build step)

_2026-10-17 · Phase 0_

**Decision:** `@summit/shared` points its `exports` at `src/index.ts`. Apps
import the TypeScript source directly; the package has no build output.

**Why:** Every tool that consumes it (Vite, tsx, Vitest) compiles TypeScript
on the fly, so edits to `shared` show up instantly with no "remember to
rebuild" step. Our base tsconfig uses `moduleResolution: "Bundler"`, which
supports this.

**Trade-off:** plain Node can't run `.ts`, so the server's production build
must bundle `shared` into its output (to set up in Phase 4).

**Alternatives considered:**

- _Build `shared` to `dist/` with `tsc`:_ works with plain Node, but adds a
  build/watch step and stale-build bugs.
- _TypeScript project references:_ robust for big monorepos; more config than
  three packages need.

---

## 003 — Vitest as the only test runner

_2026-10-17 · Phase 0_

**Decision:** Use Vitest for the web app, the server, and the shared package.

**Why:** One runner, one API (`describe`/`it`/`expect`), and one config style
across the repo. It handles TypeScript and ES modules with no extra setup.
Supertest works with it unchanged.

**Alternatives considered:** _Jest_ for the server (allowed by CLAUDE.md). It's
widely used, but it needs ts-jest or Babel for TypeScript/ESM, and it would
mean two runners to learn.

---

## 004 — Node 24 LTS, TypeScript pinned to 6.0

_2026-10-17 · Phase 0_

**Decision:** `.nvmrc` pins Node **24** (used locally and in CI). `engines`
requires Node **≥ 22.12**. TypeScript is pinned to **`~6.0`**.

**Why:**

- Node 20 reached end-of-life in April 2026. Vitest 5 requires Node ≥ 22.12.
- TypeScript 7 (the new native compiler) is the latest release, but
  typescript-eslint supports only TypeScript `< 6.1`. Pinning `~6.0` keeps
  linting working and still allows 6.0.x bug fixes.

**Revisit when:** typescript-eslint supports TypeScript 7.

**Alternatives considered:** _Stay on Node 20 with Vitest 4:_ avoids a local
upgrade but builds on an end-of-life runtime.

---

## 005 — Type-aware ESLint for bugs, Prettier for formatting

_2026-10-17 · Phase 0_

**Decision:** One root `eslint.config.js` using typescript-eslint's
`recommendedTypeChecked` rules plus the React hooks rules. Prettier owns all
formatting; `eslint-config-prettier` disables any conflicting ESLint rules.

**Why:** Type-aware rules catch real bugs that syntax-only linting can't see,
most importantly un-awaited Promises (`no-floating-promises`), which cause
silent failures in Express handlers and socket code. Splitting "bugs" (ESLint)
from "style" (Prettier) means the two tools never disagree.

**Alternatives considered:**

- _Syntax-only `recommended` rules:_ faster, but misses Promise bugs.
- _Biome:_ a single, very fast tool for linting and formatting. A reasonable
  choice, but typescript-eslint plus the official React hooks plugin is the
  most widely used and documented setup, which matters while learning.

---

## 006 — Node's built-in `--env-file` instead of `dotenv`

_2026-10-17 · Phase 0_

**Decision:** The server's dev script loads `apps/server/.env` with Node's
`--env-file-if-exists` flag (forwarded by tsx). In production, the hosting
platform sets real environment variables.

**Why:** Node 22+ does this natively, so it's one less dependency.
`-if-exists` means a missing file isn't an error.

**Alternatives considered:** _`dotenv` package:_ the long-time standard; no
longer needed on modern Node.

---

## 007 — Local Postgres 17 in Docker on host port 5434

_2026-10-17 · Phase 0_

**Decision:** `docker-compose.yml` runs `postgres:17-alpine`, with data in a
named volume and a `pg_isready` health check. It is exposed on host port
**5434** (configurable with `POSTGRES_PORT`).

**Why:** Docker gives every developer the identical database with one command.
Ports 5432/5433 are commonly taken by other local Postgres instances. Sharing
a port can silently connect Summit to the wrong database, so Summit uses its
own port.

**Alternatives considered:** _Installing Postgres natively:_ version drift
between machines and harder cleanup.

---

## 008 — Leave npm install scripts blocked for esbuild and fsevents

_2026-10-17 · Phase 0_

**Decision:** npm 11 blocks dependency install scripts unless they are
approved. We have **not** approved `esbuild` (a postinstall binary check) or
`fsevents` (a source-build fallback for the macOS file watcher).

**Why:** Install scripts are a common supply-chain attack path, so we only
approve what we need. Everything works without these two: dev servers, tests,
builds, and CI on a clean clone. Both packages already ship prebuilt binaries.

**Revisit if:** a tool fails with a missing-binary error. Then run
`npm install-scripts approve <pkg>` for that package only.
