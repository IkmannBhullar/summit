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

---

## 009 — Extra meters past a summit carry over to the next peak

_2026-10-17 · Phase 1_

**Decision:** When a completed session takes a user past a peak's height, the
peak is marked summited, the next peak unlocks, and the leftover meters are
added to the new peak. Once the final peak is summited, further meters are
reported as `unusedMeters`. All of this lives in the pure `applyMeters()`
function in `packages/shared`, which the server will reuse in Phase 2.

**Why:** Every completed focus minute should count. Throwing away real effort
because it happened to cross a summit line would feel unfair.

**Alternatives considered:** _Discard the overflow:_ slightly simpler, but
some focus time would earn nothing. _Stop the session at the summit:_ would
cut sessions short, and the timer length would depend on game state.

---

## 010 — Timer as a pure state machine; side effects as events outside React

_2026-10-17 · Phase 1_

**Decision:** The timer's rules live in a pure `transition(state, action,
settings)` function that returns the next state **and a list of events**
(`focusCompleted`, `focusAbandoned`, `breakCompleted`). The `useFocusTimer`
hook feeds it actions (clicks, interval ticks, `visibilitychange`) with the
current time. It then fires the events exactly once per dispatch, outside
React's rendering. Time is tracked only through `endsAt`.

**Why:**

- Every rule (pause math, the long-break rhythm, "time already up counts as
  completed") is tested with plain function calls and no fake timers.
- Events have side effects (saving sessions, sounds, notifications). A
  `useReducer` reducer must be pure, and React deliberately runs it twice in
  StrictMode, so side effects inside it would fire twice. Dispatching outside
  React keeps "exactly once" guaranteed; a StrictMode test checks it.
- A completed session's `endedAt` is its scheduled `endsAt`, not when the
  (possibly throttled) tab noticed, so history stays accurate.

**Alternatives considered:**

- _`useReducer` + effects that compare old and new state to detect events:_
  harder to reason about and easy to double-fire.
- _XState:_ a full state-machine library with visualization tools. It's more
  than this six-action machine needs.

**Known limitation:** browsers may delay timers in hidden tabs, so the
end-of-session sound or notification can arrive late in a long-hidden tab.
Recorded times are always exact. Fully on-time background alerts would need
server push.

---

## 011 — Climb progress is derived from session history, not stored

_2026-10-17 · Phase 1_

**Decision:** Only finished sessions are saved. Climb progress (meters per
peak, summit dates) is rebuilt by replaying completed sessions, oldest first,
through `applyMeters` (`progressFromSessions` in `packages/shared`).

**Why:** One source of truth. Separately stored progress could disagree with
history, for example if one of two writes failed or an old version saved a
different shape. Replaying thousands of sessions takes well under a
millisecond. In Phase 2, importing a guest's local history is a single list.

**Alternatives considered:** _Store progress next to sessions:_ faster to
read, but it duplicates data that can drift apart. The server can still
cache it as the `Climb` table in Phase 2, with history as the source it's
rebuilt from.

---

## 012 — Restoring a session after reload; ended-while-closed counts

_2026-10-17 · Phase 1_

**Decision:** The timer's state is saved to localStorage on every
transition. On load it's restored and checked against the clock once. A
running session whose time ran out while the page was closed is recorded
as **completed**, with `endedAt` set to its scheduled end. Saved state is
validated, including a rule that a running session's `endsAt` can't be
earlier than `startedAt + durationMs`, which blocks a hand edit that
finishes a session early.

**Why:** A refresh or a sleeping laptop shouldn't cost a session. The
clock ran its full course, and solo mode works on the honor system until
the server decides in Phase 2.

**Alternatives considered:** _Treat a reload as giving up:_ matches the
rope-team rule, but it punishes accidental refreshes in solo mode.

---

## 013 — PWA: precache everything, ask before updating

_2026-10-18 · Phase 1_

**Decision:** `vite-plugin-pwa` (Workbox `generateSW`) precaches the whole
app at install time (HTML, JS, CSS, icons) and serves `index.html` for any
navigation, so the app, including deep links, works with no network.
Updates use `registerType: "prompt"`: a new version waits until the user
clicks **Reload** in a banner. App icons are generated once from
`public/icon.svg` (`npm run generate-icons -w apps/web`) and committed.

**Why:**

- A focus timer has to work on a train or with flaky Wi-Fi; there's no
  server dependency in Phase 1.
- `autoUpdate` would reload the page whenever an update arrived. Thanks to
  decision 012 a reload can't lose a session, but it would still interrupt
  the user. Asking keeps the user in control.
- Committing generated icons keeps builds fast and free of image tooling
  (the generator uses a native image library).

**Verified:** in headless Chrome, the service worker activated, all files
were cached, Chrome reported no installability errors, and the app (plus
a deep link) loaded with the server stopped and the network offline. (The
Claude desktop browser pane can't register service workers, so it can't
test this.) The check is repeatable: `npm run check:offline -w apps/web`
runs it against the latest build and exits with an error if anything fails.

**Alternatives considered:** _`autoUpdate`:_ simpler, but it reloads at
random moments. _Hand-written service worker:_ full control, but caching
and versioning are easy to get subtly wrong; Workbox handles both.

---

## 014 — Lazy-load Motion's animation features

_2026-10-18 · Phase 1_

**Decision:** Use `LazyMotion` with `domAnimation` and the lightweight `m`
components instead of `motion.*`, with `strict` so a full `motion.*`
component can't sneak back in.

**Why:** It measured about 12.5 kB gzipped smaller (150 → 138 kB) with no
change in behavior. Bundle size matters more for an installable app that
precaches everything.

**Still large:** React itself and Zod make up much of the remaining bundle.
Zod has a smaller `zod/mini` API, but switching shared schemas is a bigger
refactor; worth measuring before Phase 4's deploy.

---

## 015 — The API contract lives in `packages/shared`

_2026-10-18 · Phase 2_

**Decision:** Every API request and response has a Zod schema in
`packages/shared/src/api/`, plus one standard error shape
(`{ error: { code, message, fields? } }`). The server validates incoming
requests with them; the web app uses the same schemas for its forms and can
validate responses.

**Why:**

- One definition, two uses: a field renamed on the server becomes a type error
  in the web app immediately, and both sides apply the same validation rules
  (e.g. the 72-byte bcrypt password limit).
- Requests contain only what the client is allowed to decide. There's no
  `metersGained` or `startedAt` in a start-session request, so the
  server-authoritative rules can't be bypassed by sending extra fields: Zod
  drops unknown keys.
- A stable error `code` lets the UI branch reliably (`EMAIL_TAKEN` → "log in
  instead?") without parsing human-readable messages.

**Alternatives considered:** _OpenAPI spec plus generated clients:_ great for
public APIs with many consumers, but it's a second source of truth and a
build step for a project with one client. _tRPC:_ end-to-end types with less
boilerplate, but it hides the HTTP API, and a plain REST design is more
useful to learn and demonstrate here.
