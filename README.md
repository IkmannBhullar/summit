# Summit

[![CI](https://github.com/IkmannBhullar/summit/actions/workflows/ci.yml/badge.svg)](https://github.com/IkmannBhullar/summit/actions/workflows/ci.yml)

**A focus timer where every focus minute climbs a real mountain.** Finish a
25-minute session and your climber gains 250 m on Mt. Fuji; give up early and
you slide back down. Sign in and your climb is saved to your account, with
the server checking every meter. Or rope up with friends in a live room and
climb together: everyone starts at the same moment, and if anyone quits
early, the whole team slips.

> **Status:** Phase 3 complete. Live rope team rooms over Socket.io, on top of
> accounts and server-verified elevation (Phase 2) and the installable,
> offline-capable solo timer (Phase 1). See [the roadmap](#roadmap).

## Features

### Working now

- **Focus timer** with a configurable focus / short break / long break rhythm
  (default 25 / 5 / 15, long break after every 4th session). Start, pause,
  resume, skip a break, or give up (with confirmation).
- **Climb real peaks:** 10 m per completed focus minute, across 8 peaks from
  Mt. Fuji (3,776 m) to Mt. Everest (8,849 m). An animated SVG mountain shows
  your climber on the trail, and summits are celebrated before the next peak
  unlocks. Meters past a summit carry over.
- **Never loses a session:** reload the page, close the laptop, or switch tabs.
  The timer resumes exactly where it was, and a session that finished while
  the app was closed still counts.
- **Session history** grouped by day, plus today's count.
- **Chime and notifications** when a session or break ends. Notifications are
  offered only after your first completed session, and only notify when the
  tab is hidden.
- **Installable PWA** that works fully offline, with an update prompt instead
  of surprise reloads.
- **Mobile-first and accessible:** fits a 320 px phone without scrolling to the
  Start button, 44 px tap targets, screen-reader labels, light/dark mode, and
  reduced-motion support.
- **Accounts** (Phase 2): sign up, sign in, and a profile page. Your sessions,
  history, and climb live on the server, so they follow you across devices.
- **Elevation the server can vouch for:** when you're signed in, the server
  times every session with its own clock and calculates the meters itself, so
  they can't be faked from the browser.
- **Bring your guest climb along:** after signing in, the app offers to import
  the sessions you did on this device as a guest.
- **Guests stay first-class:** no account needed, and the guest timer appears
  instantly, even when the server is asleep or unreachable.
- **Rope team rooms** (Phase 3): start a room and send the link, or join with a
  6-character code (`K7Q-M2X`, typed any way you like). Up to 8 climbers see
  each other live on one mountain, roped together.
  - The host starts a session for everyone, with a 3-second countdown so all
    clocks begin together.
  - **If anyone gives up or leaves, the whole team slips:** nobody gets the
    meters. Complete it together and everyone climbs, on their own peak.
  - A dropped connection (Wi-Fi blip, closed laptop lid) has 15 seconds to
    come back before the team slips. Friends who arrive mid-session watch
    and join the next one.

### Planned

- **Stats** (Phase 4): streaks, a calendar heatmap, focus by hour, and tags like
  "LeetCode" or "AWS".

## Technical highlights

- **A timer that can't drift.** It never counts ticks. It stores when the
  session ends (`endsAt`) and computes `endsAt − now` on every render and
  whenever the tab becomes visible again, so throttled background tabs and
  sleeping laptops can't make it wrong.
  ([decision 010](docs/decisions.md#010--timer-as-a-pure-state-machine-side-effects-as-events-outside-react))
- **Server-authoritative elevation.** Clients only report "started" and
  "finished". The server records the start with its own clock, refuses a
  completion until the planned time has really passed (`409` with
  `Retry-After`), and calculates the meters. Pauses need no tracking: they only
  make a session longer.
  ([decision 018](docs/decisions.md#018--the-server-decides-elevation-clients-only-report-what-happened))
- **The server owns the team clock.** It sets `startsAt` and `endsAt` for a
  rope team session and decides when it completes. Each browser measures its
  clock offset NTP-style (five pings, trusting the fastest round trip), so
  everyone's countdown shows the same moment even when device clocks
  disagree by seconds.
  ([decision 022](docs/decisions.md#022--the-rope-team-protocol-full-snapshots-acknowledgements-and-clock-sync))
- **Room rules in one plain class.** Joining, the countdown, slipping,
  reconnect grace, and host hand-over live in `RoomManager`, with no sockets
  and no database. Time is injected, so tests run a whole 25-minute session
  in milliseconds, and member status is derived from the facts instead of
  stored. ([decision 024](docs/decisions.md#024--the-room-manager-a-plain-class-with-injected-time-and-derived-status))
- **Secure live connections.** Sockets sign in with the same `HttpOnly`
  cookie as the API, browsers from any other origin are refused (WebSockets
  aren't covered by CORS), and every event payload is validated.
  ([decision 025](docs/decisions.md#025--the-socketio-layer-cookie-sign-in-an-origin-check-and-background-saves))
- **Rules as pure, shared code.** The timer is a pure state machine, and
  elevation and summits come from pure functions in `packages/shared`, which
  the browser and the server both run. One API contract (Zod schemas) is
  shared too, so a mismatch is a type error, not a production bug.
- **One source of truth.** Climb progress is replayed from session history
  instead of stored separately, so the two can never disagree.
  ([decision 011](docs/decisions.md#011--climb-progress-is-derived-from-session-history-not-stored))
- **Untrusted input is validated, in layers.** Every request and everything
  read from `localStorage` goes through Zod schemas, with anti-tamper rules
  (a session can't claim meters it didn't earn), and Postgres CHECK
  constraints back them up.
- **Careful auth.** bcrypt password hashes, a JWT in an `HttpOnly`,
  `SameSite=Lax` cookie, rate-limited logins, and the same answer _and the
  same response time_ for "no such account" and "wrong password".
  ([decision 017](docs/decisions.md#017--auth-bcrypt-hashes-a-jwt-in-an-httponly-cookie-rate-limited))
- **Safe to retry.** Session ids are UUIDs created in the browser, so a
  retried request can't create a duplicate or double the meters, and the
  client retries temporary failures on its own.
- **Offline verified in a real browser.** `npm run check:offline -w apps/web`
  drives headless Chrome to check installability, then reloads with the server
  stopped and the network cut.

## Tech stack

| Area     | Tools                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Web      | React 19, TypeScript, Vite, Tailwind CSS v4, Motion, React Router, TanStack Query, socket.io-client, vite-plugin-pwa |
| Server   | Node 24, Express 5, TypeScript, Socket.io, Prisma 7, bcryptjs, jose (JWT), express-rate-limit                        |
| Shared   | `@summit/shared`: game rules, peaks, and the Zod API contract used by both sides                                     |
| Database | PostgreSQL 17 (Docker Compose locally), migrations with Prisma                                                       |
| Quality  | Vitest, React Testing Library, user-event, MSW, Supertest against a real Postgres, ESLint (type-aware), Prettier     |
| CI       | GitHub Actions with a Postgres service: format, lint, typecheck, test, build                                         |
| Planned  | Vercel + Render (Phase 4), then AWS with Terraform                                                                   |

## Repository layout

```
summit/
├── apps/
│   ├── web/                    # React front end (Vite)
│   │   ├── public/             # App icons (generated from icon.svg)
│   │   ├── scripts/            # check-offline.mjs (headless Chrome PWA check)
│   │   └── src/
│   │       ├── components/     # Shared UI: Modal, ConfirmDialog, TextField, Buttons
│   │       ├── features/       # timer, climb, history, settings, alerts, pwa, auth, sync, rooms
│   │       ├── pages/          # Timer page, centered layout, lazy-loaded room pages
│   │       └── lib/            # API client, query client, storage, dates
│   └── server/                 # Express API
│       ├── prisma/             # schema.prisma, migrations, peaks seed
│       └── src/
│           ├── routes/         # auth, sessions, climb, rooms
│           ├── services/       # passwords, tokens, sessions, import rules, rooms, roomManager
│           ├── sockets/        # Socket.io: sign-in, events, saving team sessions
│           ├── middleware/     # parsing, auth, errors
│           └── config/         # validated environment
├── packages/
│   └── shared/                 # Peaks, climb progression, schemas, API and room contracts
├── docs/decisions.md           # Architecture decision log
├── .github/workflows/          # CI pipeline
└── docker-compose.yml          # Local Postgres
```

This is an **npm workspaces** monorepo. One `npm install` at the root installs
everything, and `apps/*` import `@summit/shared` directly from its TypeScript
source. See [decisions 001–002](docs/decisions.md).

## Getting started

### Prerequisites

- **Node 24** (the version in [`.nvmrc`](.nvmrc)). With
  [nvm](https://github.com/nvm-sh/nvm): `nvm install` and then `nvm use` in the repo root.
- **Docker Desktop**, for the local Postgres database.

### Setup from a fresh clone

```bash
# 1. Clone and enter the repo
git clone https://github.com/IkmannBhullar/summit.git
cd summit

# 2. Use the project's Node version
nvm use

# 3. Install all workspaces' dependencies (exactly as locked)
npm ci

# 4. Create your local env files from the examples (they're git-ignored)
cp .env.example .env
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env

# 5. Start Postgres in the background
docker compose up -d

# 6. Create the tables (runs every migration) and add the peaks
npm run db:deploy -w apps/server
npm run db:seed -w apps/server
```

Server tests use their own database, `summit_test`, in the same Postgres.
They create, migrate, and seed it automatically, so `npm test` only needs
Postgres to be running.

### Run it

In two terminals (with Postgres running):

```bash
npm run dev -w apps/server   # API at http://localhost:4000 (try /health)
```

```bash
npm run dev -w apps/web      # App at http://localhost:5173
```

The web dev server forwards `/api/...` and the live connection
(`/socket.io`, including WebSocket upgrades) to the API (see
`vite.config.ts`), so the browser talks to one origin and no CORS setup is
needed. As a guest you
can use the timer with only the web app running; signing in needs the API.

To try a rope team on one computer, sign in as two different users: one in a
normal window and one in a private window (each keeps its own login cookie).

### Install it as an app

The service worker only exists in production builds, so build and preview:

```bash
npm run build -w apps/web && npm run preview -w apps/web
```

Open http://localhost:4173 in Chrome and click the install icon in the address
bar. After that, the installed app works with no server and no network.

### Local ports

| Service     | URL / port              | Change it with                   |
| ----------- | ----------------------- | -------------------------------- |
| Web (dev)   | `http://localhost:5173` | `vite --port`                    |
| Web (build) | `http://localhost:4173` | `vite preview --port`            |
| API         | `http://localhost:4000` | `PORT` in `apps/server/.env`     |
| Postgres    | `localhost:5434`        | `POSTGRES_PORT` in `.env` (root) |

## API overview

Every request and response is defined by a Zod schema in
`packages/shared/src/api/`. Errors always look like
`{ "error": { "code", "message", "fields"? } }`.

| Endpoint                          | What it does                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `POST /api/auth/register`         | Create an account and sign in (sets the `HttpOnly` cookie)                        |
| `POST /api/auth/login`            | Sign in (rate-limited per IP)                                                     |
| `POST /api/auth/logout`           | Sign out (clears the cookie)                                                      |
| `GET /api/auth/me`                | The signed-in user, or `401`                                                      |
| `POST /api/sessions`              | Start a session (`{ id, plannedMinutes, tag }`); the server sets `startedAt`      |
| `POST /api/sessions/:id/complete` | Finish; `409 SESSION_TOO_EARLY` + `Retry-After` if the planned time hasn't passed |
| `POST /api/sessions/:id/abandon`  | Give up (earns nothing)                                                           |
| `GET /api/sessions?limit&cursor`  | History, newest first, cursor-paginated                                           |
| `POST /api/sessions/import`       | Import guest history (up to 1,000, with plausibility rules)                       |
| `GET /api/climb`                  | Climb progress, derived from completed sessions                                   |
| `POST /api/rooms`                 | Create a rope team room you host (rate-limited per user)                          |
| `GET /api/rooms/:code`            | Is this an open room? (`404` if not)                                              |

All session, climb, and room routes require sign-in.

### Live events (Socket.io)

Typed in `packages/shared/src/rooms/events.ts`. Every request gets an
acknowledgement, `{ ok: true, data }` or `{ ok: false, error: { code, message } }`,
and after any change the server sends every member the room's full snapshot.

| Event (browser → server) | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `room:join`              | Join by code (also how a dropped connection rejoins)                |
| `room:leave`             | Leave on purpose (mid-session, the team slips)                      |
| `session:start`          | Host only: start a team session after a 3-second countdown          |
| `session:give_up`        | Give up: the session ends `ABANDONED` for everyone                  |
| `clock:ping`             | Clock sync: the server answers with its time                        |
| **`room:state`** (← in)  | The full room snapshot: members, phase and timestamps, last outcome |

## Scripts

Run from the repo root:

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `npm test`             | Run every workspace's tests (Vitest)                   |
| `npm run typecheck`    | Type-check every workspace with `tsc`                  |
| `npm run lint`         | Lint the whole repo with ESLint                        |
| `npm run lint:fix`     | Auto-fix lint problems where safe                      |
| `npm run format`       | Format everything with Prettier                        |
| `npm run format:check` | Check formatting without changing files (CI)           |
| `npm run dev -w <app>` | Start one app's dev server (`apps/web`, `apps/server`) |

Web-only scripts (add `-w apps/web`):

| Command                  | What it does                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npm run build`          | Production build with service worker and manifest                                                                  |
| `npm run preview`        | Serve the production build locally                                                                                 |
| `npm run check:offline`  | Headless Chrome check: installable + works offline (needs a build and a local Chrome; set `CHROME_PATH` if needed) |
| `npm run generate-icons` | Regenerate the PNG app icons from `public/icon.svg`                                                                |

Database scripts (add `-w apps/server`):

| Command               | What it does                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run db:migrate`  | After editing `schema.prisma`: create and apply a new migration                                      |
| `npm run db:deploy`   | Apply existing migrations (fresh clones, CI, production)                                             |
| `npm run db:seed`     | Insert or update the peaks (safe to re-run)                                                          |
| `npm run db:generate` | Regenerate the typed Prisma client (`dev`, `db:seed`, `test`, and `typecheck` do this automatically) |
| `npm run db:studio`   | Browse the database in Prisma Studio                                                                 |

CI runs `npm ci`, then format check, lint, typecheck, tests, and the web build,
in that order.

## Testing

Tests sit next to the code they test (`*.test.ts(x)`):

- **Unit tests** for the pure logic: climb progression, the timer state
  machine, date and geometry helpers, storage validation.
- **Hook tests** with fake timers, including the "tab was in the background"
  case: the clock jumps 40 minutes without any timers firing, then the tab
  becomes visible again.
- **Component and integration tests** with React Testing Library and
  user-event, querying by role and label the way a user (or screen reader)
  would. They cover full flows like completing the session that summits
  Mt. Fuji, or reopening the app after a session ended while it was closed.
- **Server tests against a real Postgres** (`summit_test`, created and
  migrated automatically) with Supertest, including deliberate **cheating
  attempts**: completing early, claiming extra meters, touching another
  user's session, forged and expired tokens.
- **Web tests with a fake server** (MSW) that exercise the real API client,
  router, and pages, for flows like signing up, signing out, saving a
  signed-in session, and importing guest history. Any request a test didn't
  plan for fails the test.
- **Room rules on a fake clock:** `RoomManager` tests advance a
  `ManualClock` through countdowns, 25-minute sessions, grace periods, and
  breaks instantly, with exact timestamps.
- **Real sockets against a real server:** socket.io-client connections with
  real login cookies cover joining, a full team session saved for everyone,
  an early quit, reconnecting in time (and not), the host leaving, and
  refusing connections without a cookie or from another website.
- **Room pages with a fake connection** that plays the server, so tests decide
  every reply and push snapshots by hand.
- **A browser-level check** (`check:offline`) for what jsdom can't test:
  service workers and installability.

## Troubleshooting

- **`Unsupported engine` or Vitest won't start:** you're on an older Node.
  Run `nvm use` (Node 24).
- **nvm says your `.npmrc` has a `prefix` setting:** nvm can't manage Node
  versions while `~/.npmrc` sets a global `prefix`. Comment that line out, and
  make sure your old global bin folder is still on your `PATH`.
- **`npm warn install-scripts` for esbuild / fsevents:** expected and safe to
  ignore. See [decision 008](docs/decisions.md#008--leave-npm-install-scripts-blocked-for-esbuild-and-fsevents).
- **`Can't reach Postgres` when running tests:** the server tests need the
  database. Start it with `docker compose up -d`.
- **The server exits with "Invalid server configuration":** a required
  setting is missing or unsafe (for example a `JWT_SECRET` under 32
  characters). Copy `apps/server/.env.example` to `apps/server/.env`; it
  explains each setting.
- **"Too many attempts" when signing in:** login and sign-up allow 10 attempts
  per 15 minutes per IP address. Wait, or restart the dev server (the counter
  is in memory).
- **Postgres port already in use:** set a different `POSTGRES_PORT` in `.env`
  and update the port in `DATABASE_URL` in `apps/server/.env` to match.
- **A rope team room won't connect from `vite preview` (port 4173):** the
  server only accepts live connections from `WEB_ORIGIN`, which defaults to
  the dev server (`http://localhost:5173`). Set
  `WEB_ORIGIN=http://localhost:4173` in `apps/server/.env` while previewing.
- **Restarting the API ended a team session:** expected. Live room state is
  kept in server memory, so a restart ends running sessions without saving
  them. See [decision 029](docs/decisions.md#029--live-rooms-run-on-one-server-instance-and-how-to-scale-them).
- **The preview build shows an old version:** that's the service worker doing
  its job. Click **Reload** in the update banner, or in Chrome DevTools go to
  Application → Service workers → Unregister.

## Roadmap

- [x] **Phase 0:** monorepo scaffold, tooling, CI
- [x] **Phase 1:** solo focus timer, mountain view, history, sound and notifications, PWA
- [x] **Phase 2:** accounts, Postgres persistence, server-side elevation, guest import
- [x] **Phase 3:** live rope team rooms (Socket.io)
- [ ] **Phase 4:** stats, offline sync, accessibility pass, first deploy
- [ ] **Phase 5:** stretch goals (AWS + Terraform, browser extension, …)

## Docs

- [Architecture decision log](docs/decisions.md): what we chose and why
- [CLAUDE.md](CLAUDE.md): the project guide and working rules
