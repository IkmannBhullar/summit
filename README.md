# Summit

[![CI](https://github.com/IkmannBhullar/summit/actions/workflows/ci.yml/badge.svg)](https://github.com/IkmannBhullar/summit/actions/workflows/ci.yml)

**A focus timer where every focus minute climbs a real mountain.** Friends can
rope up in live rooms and climb together. If anyone quits early, the whole
team slips.

> **Status:** Phase 0 complete. The monorepo, tooling, and CI are wired up;
> features start in Phase 1. See [the roadmap](#roadmap).

## Planned features

- **Solo climbs:** each completed focus minute adds 10 m of elevation toward a
  real peak (Mt. Rainier, Kilimanjaro, Everest Base Camp…). Give up early and
  that session's elevation is lost.
- **Rope team rooms:** join friends with a 6-character code and run a
  server-synced session together. If anyone leaves early, the team slips.
- **Stats:** streaks, history, focus by day/hour, and tags like "LeetCode" or "AWS".

## Tech stack

| Area      | Tools                                                                      |
| --------- | -------------------------------------------------------------------------- |
| Web       | React 19, TypeScript, Vite, Tailwind CSS v4                                |
| Server    | Node 24, Express 5, TypeScript                                             |
| Shared    | `@summit/shared`: types and game rules used by both sides                  |
| Database  | PostgreSQL 17 (Docker Compose locally)                                     |
| Quality   | Vitest, React Testing Library, Supertest, ESLint (type-aware), Prettier    |
| CI        | GitHub Actions: format, lint, typecheck, test, build on every push/PR      |
| _Planned_ | Socket.io, Prisma, Zod, Framer Motion, PWA, Vercel + Render, AWS/Terraform |

## Repository layout

```
summit/
├── apps/
│   ├── web/              # React front end (Vite)
│   └── server/           # Express API
├── packages/
│   └── shared/           # Code shared by web and server
├── docs/
│   └── decisions.md      # Architecture decision log
├── .github/workflows/    # CI pipeline
├── docker-compose.yml    # Local Postgres
└── tsconfig.base.json    # TypeScript settings shared by all packages
```

This is an **npm workspaces** monorepo. One `npm install` at the root installs
everything, and `apps/*` import `@summit/shared` directly from its TypeScript
source. See [decisions 001–002](docs/decisions.md).

## Getting started

### Prerequisites

- **Node 24** (the version in [`.nvmrc`](.nvmrc)). With
  [nvm](https://github.com/nvm-sh/nvm): `nvm install` and then `nvm use` in the repo root.
- **Docker Desktop** (for the local Postgres database).

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

# 5. Start Postgres in the background (not used by the app until Phase 2)
docker compose up -d
```

### Run it

In two terminals:

```bash
npm run dev -w apps/server   # API at http://localhost:4000 (try /health)
```

```bash
npm run dev -w apps/web      # Web app at http://localhost:5173
```

### Local ports

| Service  | URL / port              | Change it with                   |
| -------- | ----------------------- | -------------------------------- |
| Web      | `http://localhost:5173` | `vite --port`                    |
| API      | `http://localhost:4000` | `PORT` in `apps/server/.env`     |
| Postgres | `localhost:5434`        | `POSTGRES_PORT` in `.env` (root) |

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

CI runs `npm ci`, then format check, lint, typecheck, tests, and the web build,
in that order.

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

## Roadmap

- [x] **Phase 0:** monorepo scaffold, tooling, CI
- [ ] **Phase 1:** solo focus timer, mountain view, PWA (front end only)
- [ ] **Phase 2:** auth, Postgres persistence, server-side elevation
- [ ] **Phase 3:** live rope team rooms (Socket.io)
- [ ] **Phase 4:** stats, offline sync, accessibility, first deploy
- [ ] **Phase 5:** stretch goals (AWS + Terraform, browser extension, …)

## Docs

- [Architecture decision log](docs/decisions.md): what we chose and why
- [CLAUDE.md](CLAUDE.md): the project guide and working rules
