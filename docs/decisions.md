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

**Update (Phase 2):** Prisma added two more blocked scripts, `@prisma/engines`
(downloads the schema engine) and `prisma` (a version check). Generating the
client, migrating, and seeding all work without them, locally and in CI, so
they stay blocked too.

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

---

## 016 — Prisma 7 with migrations, database CHECKs, and a real test database

_2026-10-18 · Phase 2_

**Decision:**

- **Prisma 7.10** (the stable line; `latest` pointed at an 8.0 release
  candidate) with its TypeScript-native client and the `pg` driver adapter.
  The client is generated into `src/generated/` and not committed.
- Schema changes only happen through **migrations** (`prisma/migrations/`),
  applied with `migrate deploy` everywhere but local development.
- The first migration adds **hand-written CHECK constraints** that Prisma's
  schema language can't express: minute limits, non-negative meters, "only
  completed sessions earn meters", end-after-start, lowercase emails.
- **Climb progress isn't stored** (no Climb table). It's derived from
  sessions, as in decision 011. Peaks are seeded from shared `PEAKS` so SQL
  can join on them.
- Server tests run against a **real Postgres database** (`summit_test`)
  that global setup creates, migrates, and seeds. Tables are truncated
  before each test, and test files run one at a time. Setup refuses any
  database whose name doesn't end in `_test`. CI runs the same Postgres
  version as a service container.

**Why:** CHECK constraints are defense in depth: the database rejects
impossible data even if application code has a bug. A real test database
catches what mocks can't: wrong queries, constraint violations, and
migration mistakes.

**Alternatives considered:** _Mocking Prisma in tests:_ faster, but it
can't fail on a broken query. _A separate Docker container for tests:_
cleaner isolation, but heavier; a second database in the same Postgres is
enough. _Drizzle or Kysely:_ lighter and closer to SQL, but Prisma's
schema-first migrations and generated types are a good fit for learning.

---

## 017 — Auth: bcrypt hashes, a JWT in an httpOnly cookie, rate-limited

_2026-10-18 · Phase 2_

**Decision:**

- **Passwords** are hashed with bcrypt (`bcryptjs`, pure JavaScript, the
  same algorithm and hash format as native `bcrypt`), cost 12, configurable
  as `BCRYPT_ROUNDS` (minimum 10). Passwords over 72 bytes are rejected
  (bcrypt ignores the rest).
- **Signing in** sets a 7-day JWT (HS256, `jose`) in the `summit_session`
  cookie: **httpOnly** (page JavaScript can't read it), **SameSite=Lax**
  (not sent with cross-site POSTs), **Secure** in production. Tokens are
  checked for algorithm, issuer, audience, and expiry.
- **No account enumeration on login:** an unknown email gets the same
  "Wrong email or password" (401) as a wrong password, _and_ takes the same
  time, by comparing against a dummy hash made with the same cost.
  (Registration still says when an email is taken; that's unavoidable for a
  usable sign-up form, and rate limiting keeps it slow to abuse.)
- **Rate limiting:** 10 login/register attempts per IP per 15 minutes,
  answered with 429 `RATE_LIMITED`. In production, `trust proxy` is set to
  one hop so the limiter sees real client IPs behind the host's proxy.
- **CSRF:** SameSite=Lax plus "JSON bodies only" (decision 015, step 2).
  HTML forms can't send JSON, and cross-site JavaScript can't send it
  without a CORS preflight we don't allow.

**Why cookies instead of a token in localStorage?** Anything in
localStorage is readable by any script on the page, so one XSS bug leaks
every user's token. An httpOnly cookie can't be read by scripts at all, and
the browser attaches it automatically.

**Known trade-offs:**

- Stateless JWTs can't be revoked before they expire. Logout deletes the
  cookie, but a copied token keeps working for up to 7 days. If needed, add
  a per-user `tokenVersion` checked on each request ("log out everywhere").
- The in-memory rate-limit store is per server process. With several
  instances, each counts separately; a shared store (Redis) would fix that,
  the same scaling note as Socket.io in Phase 3.
- Phase 4's cross-site deploy (web on Vercel, API on Render) changes cookie
  rules (SameSite=None plus extra CSRF protection, or a custom domain so both
  are same-site). That's revisited then.

**Alternatives considered:** _Server-side sessions in the database:_
revocable, but a database lookup on every request. _An auth provider
(Auth0, Clerk, Supabase Auth):_ less code, but the point here is to
understand and show how auth works. _Argon2:_ a newer password hash and a
fine choice, but it needs a native build; bcrypt is still widely accepted
at this cost.

---

## 018 — The server decides elevation; clients only report what happened

_2026-10-18 · Phase 2_

**Decision:** For signed-in users, the session API is server-authoritative:

- **Start** (`POST /api/sessions`): the client sends only `{ id, plannedMinutes,
tag }`. The server records `startedAt` from **its own clock**.
- **Complete** (`POST /api/sessions/:id/complete`): accepted only if at least
  `plannedMinutes` have passed **on the server's clock** since `startedAt`,
  minus a 10-second network tolerance. Otherwise it's
  `409 SESSION_TOO_EARLY` with a `Retry-After` header. Meters come from the
  shared `metersEarned()`, never from the request.
- **Abandon** earns nothing. **Climb progress** is replayed from completed
  sessions with the shared `progressFromSessions` (decision 011).

**Why:** Anything a browser sends can be faked: DevTools, a modified client,
or a script calling the API directly. If the client said "I earned 250 m",
anyone could claim 100,000. The server can't know whether someone _focused_,
but it can guarantee that the planned time really passed and that meters
follow the rules. Because both measurements (start and finish) use the
server's clock, a wrong clock on the user's device doesn't matter. Pauses
need no tracking: they only make a session longer, and "enough time passed"
still holds.

**Supporting choices:**

- **Client-generated UUIDs as idempotency keys:** the timer starts instantly,
  and a retried start or completion can't create duplicates or double meters.
  An id owned by another user is refused.
- **One running session per user**, enforced by a partial unique index
  (`WHERE status = 'RUNNING'`). Starting a new session abandons a leftover
  one, e.g. from a closed tab.
- **Conditional updates** (`WHERE status = 'RUNNING'`) make simultaneous
  complete/abandon requests safe: only one can win.
- Another user's session returns **404, not 403**, so ids can't be probed.
- **Cursor pagination** over `(startedAt DESC, id ASC)`, matching the index.
- An **injectable clock** (`now`) lets tests check "10 minutes later" exactly,
  without fake timers.

**Known limits:** The server proves time passed, not attention; a user can
start a session and walk away. The 10-second tolerance means a session can
finish up to 10 s early, which never changes the meters earned. Imported
guest history (step 6) can't be verified this way, so it's marked `imported`.

**Alternatives considered:** _Trust the client's meters:_ trivially cheatable.
_The server runs the timer and pushes the end:_ stronger, but it needs a
persistent connection (that's Phase 3's rope-team model) and breaks when the
connection drops.

---

## 019 — Importing guest history: trusted once, made plausible, and flagged

_2026-10-18 · Phase 2_

**Decision:** `POST /api/sessions/import` copies up to 1,000 sessions from a
guest's browser into their new account. The server can't verify history it
never saw live (decision 018), so a pure rule function (`importRules.ts`)
only accepts sessions that are at least physically plausible:

- finished (COMPLETED or ABANDONED), solo (no `roomId`)
- **started before the account was created** (later sessions should have used
  the live, server-checked API)
- not in the future (with 5 minutes of allowance for device clock drift)
- a "completed" session lasted at least its planned length
- **no overlaps** with each other or with the account's existing sessions
  (nobody focuses twice at once, which also caps any day at 24 hours)
- ids not already in the database (re-importing is a harmless no-op, and
  another user's ids are skipped without revealing anything)

Meters are **recalculated** on the server, every accepted row is marked
`imported = true`, and the response says how many were imported and skipped.

**Why:** Phase 1 users shouldn't lose their climbs when they sign up, but
import is the one place a cheater could invent history. The rules can't stop
someone fabricating _plausible_ past sessions, so the `imported` flag keeps
that history visible and separable (e.g. a Phase 5 leaderboard can count only
live, server-verified sessions).

**Alternatives considered:** _Don't import at all:_ simplest and fully
trustworthy, but it punishes early users. _Import without rules:_ an easy way
to grant yourself unlimited elevation. _Allow import only once:_ an extra
rule to manage, and the overlap and pre-signup rules already make repeating
it pointless.

---

## 020 — Web auth: React Router, TanStack Query, and an MSW-mocked API in tests

_2026-10-19 · Phase 2_

**Decision:**

- **React Router** (data router) for pages: `/`, `/login`, `/register`, and a
  protected `/account`. A layout route holds the header and app-wide dialogs;
  pages get shared state through the outlet context.
- **TanStack Query** caches server data. The signed-in user is one cache entry
  (`["auth", "me"]`): fetched once, shared everywhere, updated directly by
  login and logout. Client errors (4xx) are never retried; mutations are never
  retried automatically.
- **One API client** (`lib/api.ts`) for every request: JSON, cookies
  (`credentials: "include"`), typed `ApiRequestError`s, and response
  validation with the shared schemas.
- **Guests are first-class.** "Not signed in" is `null`, not an error, and the
  timer works even when the API can't be reached (offline PWA).
- **`RequireAuth` decides where you go when the user disappears:** a guest
  arriving at a protected page goes to `/login` (and comes back after
  signing in); a user who signs out _while on it_ goes home.
- **Tests mock the network with MSW**, so they exercise the real client,
  router, and pages. Unhandled requests fail the test (`onUnhandledFrame:
"error"`; MSW 3 renamed it from `onUnhandledRequest`, and the typecheck
  caught the old name being silently ignored).

**A bug worth remembering:** signing out from `/account` first did
"log out, then navigate home". That raced with `RequireAuth`, which saw "no
user" and redirected to `/login`; which one won depended on render timing,
so the test failed in about half of the full-suite runs. Two timing fixes
(awaiting the navigation, then `flushSync`) only made it rarer. The fix that
worked removed the race: the guard itself knows whether it saw a user, so
signing out needs no navigation of its own. The test then passed 8 of 8 full runs.

**Alternatives considered:** _Hand-written fetch hooks:_ no dependency, but
re-implementing caching, deduplication, and retries. _SWR:_ similar to
TanStack Query, with a smaller API but fewer mutation tools. _Mocking
`fetch` with `vi.fn`:_ simpler, but it skips the real request and response
handling that MSW exercises.

**Follow-ups:** The bundle is now about 181 kB gzipped; lazy-loading the auth
pages would keep the timer's first load lean. Moving focus to the new page's
heading on navigation (for screen readers) belongs in Phase 4's
accessibility pass.

---

## 021 — One "session store" interface: localStorage for guests, the API for accounts

_2026-10-19 · Phase 2_

**Decision:** The timer page talks to a `SessionStore` (sessions, climb
progress, "load older", and an event handler). Guests get the Phase 1 store,
backed by localStorage. Signed-in users get an account store:

- The timer machine now emits **`focusStarted`** (decision 010's events are
  still the only side-effect channel). The account store sends it as
  `POST /api/sessions` with the timer's own UUID, then `complete` or `abandon`
  when the period ends.
- A completion **waits for its start request** to settle, so the server never
  hears "finished" before "started".
- Start and finish requests are **retried** on network failures, 5xx, and
  `SESSION_TOO_EARLY`, waiting the server's `Retry-After`. That's safe because
  the server de-duplicates by session id (decision 018). Other errors are
  shown to the user and not retried.
- After a successful finish, history and climb are **re-fetched**, so the
  screen shows the server's numbers, not the browser's.
- Summit celebrations wait for progress to load, so opening the app never
  replays old summits.
- A device hint (`summit:signed-in-hint`, only a flag) lets **guests see the
  timer instantly**, without waiting for a server that may be slow to wake,
  while signed-in devices show a brief "Loading your climb…" instead of a
  flash of guest data.

**Why:** The page and timer stay identical for both kinds of user; only
where data lives changes. In Phase 4 the account store gains an offline
queue without touching the page.

**Known gap until Phase 4:** signed in and offline, the session runs, but its
start or finish can't reach the server, and the app says so ("Couldn't save
your session to your account…"). The offline queue will hold and sync it.
