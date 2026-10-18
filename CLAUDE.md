# Summit — Project Guide for Claude

## What we're building
Summit is a Pomodoro-style focus app.
- **Solo mode:** each completed focus minute adds elevation toward a real peak
  (Mt. Rainier, Kilimanjaro, Everest Base Camp, etc.). Quitting a session early
  loses the elevation gained in that session ("you slid back down").
- **Rope team rooms:** friends join a live room with a short code, start a
  synced session together, and see each other's status. If anyone leaves early,
  the session fails for the whole team.
- **Stats:** history, streaks, focus by day/hour, and tags (e.g. "LeetCode", "AWS").

This is a portfolio project. Code quality, tests, README, and architecture
decisions matter as much as features.

## About me (the developer)
- New grad, building this to learn and to show employers.
- Teach as you go: explain what you're doing and why in plain language,
  as if to a beginner, before and after each change.
- Comment every code block (functions, components, non-obvious lines).
- At the end of each step, give me 3 short quiz questions to check I
  understood what we built. Put the answers in a collapsed section.
- If there are two reasonable approaches, briefly show both and recommend one.

## Working rules
- Work one phase at a time. Start every phase by showing a short plan and
  waiting for my "go".
- Stop after each logical step so I can review, run it, and commit.
- Suggest a conventional commit message after each step (feat:, fix:, chore:, test:, docs:).
- Don't add a dependency without saying what it does and why we need it.
- Write tests alongside features, not at the end.
- Never commit secrets. Use `.env` files and keep `.env.example` updated.
- Keep a running `docs/decisions.md` log: one short entry per important
  architecture decision (what, why, alternatives considered).

## Tech stack
- **Monorepo:** npm workspaces
  - `apps/web` — React + TypeScript + Vite, Tailwind CSS, Framer Motion, vite-plugin-pwa
  - `apps/server` — Node + Express + TypeScript, Socket.io, Prisma
  - `packages/shared` — shared TypeScript types and Zod schemas (used by both sides)
- **Database:** PostgreSQL (Docker Compose for local dev)
- **Auth:** email + password, bcrypt hashing, JWT in httpOnly cookies
- **Testing:** Vitest + React Testing Library (web), Jest or Vitest + Supertest (server)
- **CI:** GitHub Actions — lint, typecheck, and test on every push/PR
- **Deploy (first):** web on Vercel, server + Postgres on Render
- **Deploy (later):** AWS with Terraform (see Phase 5)

## Core rules of the app

### Timer accuracy (important)
- Never count ticks with setInterval to track time. Browsers throttle
  background tabs and the timer drifts.
- Store `endsAt` (a timestamp). Remaining time = `endsAt - now`, recomputed
  on every render tick and when the tab becomes visible again.
- In rope team rooms the **server is the source of truth**: it sets
  `startsAt`/`endsAt` and broadcasts them. Clients estimate their clock
  offset from the server and correct for it.

### Elevation math
- 10 meters per completed focus minute (configurable constant in `packages/shared`).
- A 25-minute session = 250 m. Mt. Rainier (4,392 m) ≈ 18 sessions.
- Abandoned session → that session's elevation is not added.
- Reaching a peak's height marks it summited and unlocks the next peak.

### Session lifecycle
`PLANNED → RUNNING → COMPLETED | ABANDONED`
Breaks are not stored as sessions.

## Data model (starting point — refine in Phase 2)
- **User**: id, email, passwordHash, displayName, createdAt
- **Peak** (seeded): id, name, heightMeters, region, order
- **Climb**: id, userId, peakId, metersGained, summitedAt (nullable)
- **FocusSession**: id, userId, plannedMinutes, startedAt, endedAt,
  status, tag (nullable), metersGained, roomId (nullable)
- **Room**: id, code (6 chars), hostId, createdAt, closedAt (nullable)
- Live room state (who's connected, current session timing) lives in server
  memory for now. Note in decisions.md: scaling to multiple server instances
  would need a Redis adapter for Socket.io.

## Folder conventions
- Components: `apps/web/src/components/` (PascalCase files)
- Feature folders: `apps/web/src/features/<feature>/` (timer, rooms, stats, auth)
- Server: `apps/server/src/routes/`, `services/`, `sockets/`, `middleware/`
- Shared schemas: `packages/shared/src/`

## Definition of done (every phase)
- Runs locally from a clean clone using README instructions
- Lint, typecheck, and tests pass in CI
- README and decisions.md updated
- I've reviewed the code and answered the quiz
