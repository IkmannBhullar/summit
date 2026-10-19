# Summit

[![CI](https://github.com/IkmannBhullar/summit/actions/workflows/ci.yml/badge.svg)](https://github.com/IkmannBhullar/summit/actions/workflows/ci.yml)

**A focus timer where every focus minute climbs a real mountain.** Finish a
25-minute session and your climber gains 250 m on Mt. Fuji; give up early and
you slide back down. Coming next: friends rope up in live rooms and climb
together, and if anyone quits early, the whole team slips.

> **Status:** Phase 1 complete. The solo timer is fully playable, installable,
> and works offline (no backend yet). See [the roadmap](#roadmap).

## Features

### Working now (Phase 1)

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

### Planned

- **Accounts and sync** (Phase 2): the server stores sessions and calculates
  elevation, so it can't be faked from the browser.
- **Rope team rooms** (Phase 3): join friends with a 6-character code for a
  server-synced session. If anyone leaves early, the team slips.
- **Stats** (Phase 4): streaks, a calendar heatmap, focus by hour, and tags like
  "LeetCode" or "AWS".

## Technical highlights

- **A timer that can't drift.** It never counts ticks. It stores when the
  session ends (`endsAt`) and computes `endsAt − now` on every render and
  whenever the tab becomes visible again, so throttled background tabs and
  sleeping laptops can't make it wrong.
  ([decision 010](docs/decisions.md#010--timer-as-a-pure-state-machine-side-effects-as-events-outside-react))
- **Rules as pure, shared code.** The timer is a pure state machine, and
  elevation and summits come from pure functions in `packages/shared`. They're
  testable without fake timers and ready for the server to reuse in Phase 2.
- **One source of truth.** Climb progress is replayed from session history
  instead of stored separately, so the two can never disagree.
  ([decision 011](docs/decisions.md#011--climb-progress-is-derived-from-session-history-not-stored))
- **Untrusted input is validated.** Everything read from `localStorage` goes
  through Zod schemas, including anti-tamper rules (e.g. a session can't claim
  more meters than it earned, or end earlier than it was allowed to).
- **Offline verified in a real browser.** `npm run check:offline -w apps/web`
  drives headless Chrome to check installability, then reloads with the server
  stopped and the network cut.

## Tech stack

| Area     | Tools                                                                               |
| -------- | ----------------------------------------------------------------------------------- |
| Web      | React 19, TypeScript, Vite, Tailwind CSS v4, Motion, vite-plugin-pwa                |
| Server   | Node 24, Express 5, TypeScript                                                      |
| Shared   | `@summit/shared`: game rules, peaks, and Zod schemas used by both sides             |
| Database | PostgreSQL 17 (Docker Compose locally)                                              |
| Quality  | Vitest, React Testing Library, user-event, Supertest, ESLint (type-aware), Prettier |
| CI       | GitHub Actions: format, lint, typecheck, test, build on every push/PR               |
| Planned  | Prisma, Socket.io, Vercel + Render, then AWS with Terraform                         |

## Repository layout

```
summit/
├── apps/
│   ├── web/                    # React front end (Vite)
│   │   ├── public/             # App icons (generated from icon.svg)
│   │   ├── scripts/            # check-offline.mjs (headless Chrome PWA check)
│   │   └── src/
│   │       ├── components/     # Shared UI: Modal, ConfirmDialog
│   │       ├── features/       # timer, climb, history, settings, alerts, pwa
│   │       └── lib/            # storage, dates, useNow
│   └── server/                 # Express API (health route so far)
├── packages/
│   └── shared/                 # Peaks, climb progression, schemas
├── docs/decisions.md           # Architecture decision log
├── .github/workflows/          # CI pipeline
└── docker-compose.yml          # Local Postgres (used from Phase 2)
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

The Phase 1 app runs entirely in the browser:

```bash
npm run dev -w apps/web      # http://localhost:5173
```

The API (just a health check so far) runs separately:

```bash
npm run dev -w apps/server   # http://localhost:4000/health
```

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

| Command               | What it does                                                                   |
| --------------------- | ------------------------------------------------------------------------------ |
| `npm run db:migrate`  | After editing `schema.prisma`: create and apply a new migration                |
| `npm run db:deploy`   | Apply existing migrations (fresh clones, CI, production)                       |
| `npm run db:seed`     | Insert or update the peaks (safe to re-run)                                    |
| `npm run db:generate` | Regenerate the typed Prisma client (tests and typecheck do this automatically) |
| `npm run db:studio`   | Browse the database in Prisma Studio                                           |

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
- **Postgres port already in use:** set a different `POSTGRES_PORT` in `.env`
  and update the port in `DATABASE_URL` in `apps/server/.env` to match.
- **The preview build shows an old version:** that's the service worker doing
  its job. Click **Reload** in the update banner, or in Chrome DevTools go to
  Application → Service workers → Unregister.

## Roadmap

- [x] **Phase 0:** monorepo scaffold, tooling, CI
- [x] **Phase 1:** solo focus timer, mountain view, history, sound and notifications, PWA
- [ ] **Phase 2:** auth, Postgres persistence, server-side elevation
- [ ] **Phase 3:** live rope team rooms (Socket.io)
- [ ] **Phase 4:** stats, offline sync, accessibility pass, first deploy
- [ ] **Phase 5:** stretch goals (AWS + Terraform, browser extension, …)

## Docs

- [Architecture decision log](docs/decisions.md): what we chose and why
- [CLAUDE.md](CLAUDE.md): the project guide and working rules
