// Integration tests for the session API, against the real test database.
// The app gets a controllable clock, so "25 minutes later" is exact and instant.
import {
  ClimbResponseSchema,
  getCurrentClimb,
  ImportResultSchema,
  RecentTagsResponseSchema,
  MAX_IMPORT_SESSIONS,
  type FocusSession,
  SessionPageSchema,
  SessionResponseSchema,
} from "@summit/shared";
import { randomUUID } from "node:crypto";
import request, { type Response } from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { COMPLETION_TOLERANCE_MS } from "../services/sessions";
import { testConfig } from "../test/config";
import { createTestPrisma, resetDatabase } from "../test/db";
import { apiError } from "../test/http";

const prisma = createTestPrisma();
const MIN = 60_000;
const T0 = Date.parse("2026-10-18T09:00:00.000Z");

/** The server's clock in these tests. Tests move it forward with `wait()`. */
let clock = T0;
const wait = (ms: number) => {
  clock += ms;
};

const app = createApp({
  config: testConfig,
  prisma,
  authRateLimit: { windowMs: 60_000, limit: 1000 },
  now: () => new Date(clock),
});

beforeEach(async () => {
  await resetDatabase(prisma);
  clock = T0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A signed-in "browser": an agent that keeps the login cookie between requests. */
async function signIn(email = "ana@example.com") {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .send({ email, password: "correct horse battery", displayName: "Climber" });
  expect(res.status).toBe(201);
  return agent;
}
type Agent = Awaited<ReturnType<typeof signIn>>;

const sessionIn = (res: Response) => SessionResponseSchema.parse(res.body).session;

/** Starts a 25-minute session with a fresh client-generated id. */
async function start(agent: Agent, plannedMinutes = 25) {
  const id = randomUUID();
  const res = await agent.post("/api/sessions").send({ id, plannedMinutes });
  return { id, res };
}

/** Starts a session, waits it out, and completes it. */
async function focus(agent: Agent, plannedMinutes = 25) {
  const { id } = await start(agent, plannedMinutes);
  wait(plannedMinutes * MIN);
  const res = await agent.post(`/api/sessions/${id}/complete`);
  expect(res.status).toBe(200);
  return id;
}

const climb = async (agent: Agent) =>
  ClimbResponseSchema.parse((await agent.get("/api/climb")).body).progress;

describe("POST /api/sessions (start)", () => {
  it("starts a RUNNING session using the server's clock (201)", async () => {
    const agent = await signIn();

    const { id, res } = await start(agent);

    expect(res.status).toBe(201);
    expect(sessionIn(res)).toEqual({
      id,
      plannedMinutes: 25,
      startedAt: new Date(T0).toISOString(),
      endedAt: null,
      status: "RUNNING",
      tag: null,
      metersGained: 0,
      roomId: null,
    });
  });

  // The client sends its own UUID, so retrying a start can't create duplicates.
  it("treats a repeated start with the same id as a retry (200, no duplicate)", async () => {
    const agent = await signIn();
    const id = randomUUID();

    const first = await agent.post("/api/sessions").send({ id, plannedMinutes: 25 });
    wait(5_000);
    const retry = await agent.post("/api/sessions").send({ id, plannedMinutes: 25 });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(sessionIn(retry).startedAt).toBe(sessionIn(first).startedAt); // unchanged
    await expect(prisma.focusSession.count()).resolves.toBe(1);
  });

  it("gives up a still-running session when a new one starts", async () => {
    const agent = await signIn();
    const { id: older } = await start(agent);
    wait(3 * MIN);

    await start(agent);

    const row = await prisma.focusSession.findUniqueOrThrow({ where: { id: older } });
    expect(row).toMatchObject({ status: "ABANDONED", metersGained: 0 });
    await expect(prisma.focusSession.count({ where: { status: "RUNNING" } })).resolves.toBe(1);
  });

  it("refuses an id already used by another user (409)", async () => {
    const ana = await signIn("ana@example.com");
    const ben = await signIn("ben@example.com");
    const { id } = await start(ana);

    const res = await ben.post("/api/sessions").send({ id, plannedMinutes: 25 });

    expect(res.status).toBe(409);
    expect(apiError(res).code).toBe("CONFLICT");
  });

  it.each([
    ["a non-UUID id", { id: "my-session", plannedMinutes: 25 }],
    ["too many minutes", { id: randomUUID(), plannedMinutes: 500 }],
    ["zero minutes", { id: randomUUID(), plannedMinutes: 0 }],
  ])("rejects %s (400)", async (_label, body) => {
    const agent = await signIn();

    const res = await agent.post("/api/sessions").send(body);

    expect(res.status).toBe(400);
    expect(apiError(res).code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/sessions/:id/complete", () => {
  it("completes after the planned time and awards meters calculated by the server", async () => {
    const agent = await signIn();
    const { id } = await start(agent);
    wait(25 * MIN);

    const res = await agent.post(`/api/sessions/${id}/complete`);

    expect(res.status).toBe(200);
    expect(sessionIn(res)).toMatchObject({
      status: "COMPLETED",
      metersGained: 250,
      endedAt: new Date(T0 + 25 * MIN).toISOString(),
    });
  });

  it("accepts a completion within the network tolerance", async () => {
    const agent = await signIn();
    const { id } = await start(agent);
    wait(25 * MIN - COMPLETION_TOLERANCE_MS);

    expect((await agent.post(`/api/sessions/${id}/complete`)).status).toBe(200);
  });

  it("allows pauses: completing later than planned is fine", async () => {
    const agent = await signIn();
    const { id } = await start(agent);
    wait(25 * MIN + 30 * MIN); // a 30-minute pause somewhere in the middle

    const res = await agent.post(`/api/sessions/${id}/complete`);

    expect(sessionIn(res).metersGained).toBe(250);
  });

  it("is idempotent: completing twice doesn't double the meters", async () => {
    const agent = await signIn();
    const id = await focus(agent);

    const again = await agent.post(`/api/sessions/${id}/complete`);

    expect(again.status).toBe(200);
    expect(getCurrentClimb(await climb(agent))?.climb.metersGained).toBe(250);
  });

  it("returns 404 for an unknown session", async () => {
    const agent = await signIn();

    const res = await agent.post(`/api/sessions/${randomUUID()}/complete`);

    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id instead of a server error", async () => {
    const agent = await signIn();

    const res = await agent.post("/api/sessions/not-a-uuid/complete");

    expect(res.status).toBe(400);
    expect(apiError(res).fields).toEqual({ id: "Invalid session id." });
  });
});

describe("cheating attempts", () => {
  it("can't complete a session early (409 SESSION_TOO_EARLY with Retry-After)", async () => {
    const agent = await signIn();
    const { id } = await start(agent);
    wait(10 * MIN);

    const res = await agent.post(`/api/sessions/${id}/complete`);

    expect(res.status).toBe(409);
    expect(apiError(res)).toEqual({
      code: "SESSION_TOO_EARLY",
      message: "This session isn't finished yet: 890s to go.",
    });
    // 15 minutes left, minus the 10 s tolerance = 890 s.
    expect(res.headers["retry-after"]).toBe("890");
    await expect(prisma.focusSession.count({ where: { status: "COMPLETED" } })).resolves.toBe(0);
  });

  it("can't complete even 1 second before the tolerance allows", async () => {
    const agent = await signIn();
    const { id } = await start(agent);
    wait(25 * MIN - COMPLETION_TOLERANCE_MS - 1_000);

    expect((await agent.post(`/api/sessions/${id}/complete`)).status).toBe(409);
  });

  it("ignores meters, times, and status sent by the client", async () => {
    const agent = await signIn();
    const id = randomUUID();

    const res = await agent.post("/api/sessions").send({
      id,
      plannedMinutes: 25,
      metersGained: 99_999,
      startedAt: "2020-01-01T00:00:00.000Z",
      status: "COMPLETED",
    });

    expect(sessionIn(res)).toMatchObject({
      status: "RUNNING",
      metersGained: 0,
      startedAt: new Date(T0).toISOString(),
    });
  });

  it("can't complete or abandon another user's session (404, as if it didn't exist)", async () => {
    const ana = await signIn("ana@example.com");
    const ben = await signIn("ben@example.com");
    const { id } = await start(ana);
    wait(25 * MIN);

    expect((await ben.post(`/api/sessions/${id}/complete`)).status).toBe(404);
    expect((await ben.post(`/api/sessions/${id}/abandon`)).status).toBe(404);
    const row = await prisma.focusSession.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("RUNNING");
  });

  it("can't complete a session after giving up on it (409)", async () => {
    const agent = await signIn();
    const { id } = await start(agent);
    await agent.post(`/api/sessions/${id}/abandon`);
    wait(25 * MIN);

    const res = await agent.post(`/api/sessions/${id}/complete`);

    expect(res.status).toBe(409);
    expect(apiError(res).code).toBe("CONFLICT");
  });

  it("can't 'restart' a finished session to complete it again", async () => {
    const agent = await signIn();
    const id = await focus(agent);

    // Re-sending the start returns the existing COMPLETED session unchanged.
    const restart = await agent.post("/api/sessions").send({ id, plannedMinutes: 25 });

    expect(sessionIn(restart).status).toBe("COMPLETED");
    expect(getCurrentClimb(await climb(agent))?.climb.metersGained).toBe(250);
  });
});

describe("POST /api/sessions/:id/abandon", () => {
  it("abandons with 0 m and is idempotent", async () => {
    const agent = await signIn();
    const { id } = await start(agent);
    wait(12 * MIN);

    const first = await agent.post(`/api/sessions/${id}/abandon`);
    const again = await agent.post(`/api/sessions/${id}/abandon`);

    expect(sessionIn(first)).toMatchObject({
      status: "ABANDONED",
      metersGained: 0,
      endedAt: new Date(T0 + 12 * MIN).toISOString(),
    });
    expect(again.status).toBe(200);
  });

  it("can't abandon a completed session (409)", async () => {
    const agent = await signIn();
    const id = await focus(agent);

    expect((await agent.post(`/api/sessions/${id}/abandon`)).status).toBe(409);
  });
});

describe("GET /api/sessions (history)", () => {
  it("pages through finished sessions newest first, without gaps or duplicates", async () => {
    const agent = await signIn();
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      ids.push(await focus(agent, 1));
      wait(MIN);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: Record<string, string | number> = cursor ? { limit: 10, cursor } : { limit: 10 };
      const page = SessionPageSchema.parse((await agent.get("/api/sessions").query(query)).body);
      seen.push(...page.sessions.map((s) => s.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3); // 10 + 10 + 5
    expect(seen).toEqual(ids.toReversed());
  });

  it("only lists finished sessions, and only the signed-in user's", async () => {
    const ana = await signIn("ana@example.com");
    const ben = await signIn("ben@example.com");
    await focus(ana);
    await focus(ben);
    await start(ana); // still running: not part of history yet

    const page = SessionPageSchema.parse((await ana.get("/api/sessions")).body);

    expect(page.sessions).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor (400)", async () => {
    const agent = await signIn();

    const res = await agent.get("/api/sessions").query({ cursor: "definitely-not-a-cursor" });

    expect(res.status).toBe(400);
    expect(apiError(res).fields).toEqual({ cursor: "Invalid cursor." });
  });
});

describe("GET /api/climb", () => {
  it("starts at 0 m on Mt. Fuji", async () => {
    const agent = await signIn();

    expect(getCurrentClimb(await climb(agent))).toMatchObject({
      peak: { id: "mt-fuji" },
      climb: { metersGained: 0 },
    });
  });

  it("is derived from completed sessions only, and summits carry over", async () => {
    const agent = await signIn();
    for (let i = 0; i < 16; i++) {
      await focus(agent); // 16 × 250 m = 4,000 m: past Fuji's 3,776 m
    }
    const { id } = await start(agent);
    await agent.post(`/api/sessions/${id}/abandon`); // earns nothing

    const progress = await climb(agent);

    expect(progress.climbs[0]).toMatchObject({ peakId: "mt-fuji", metersGained: 3776 });
    expect(progress.climbs[0]?.summitedAt).not.toBeNull();
    expect(getCurrentClimb(progress)).toMatchObject({
      peak: { id: "mt-rainier" },
      climb: { metersGained: 224 },
    });
  });
});

describe("tags", () => {
  /** Starts (and abandons, to free the slot) a session with this tag. */
  async function tagged(agent: Agent, tag: string) {
    const id = randomUUID();
    const res = await agent.post("/api/sessions").send({ id, plannedMinutes: 25, tag });
    expect(res.status).toBe(201);
    await agent.post(`/api/sessions/${id}/abandon`);
    wait(MIN);
    return sessionIn(res);
  }
  const recent = async (agent: Agent) =>
    RecentTagsResponseSchema.parse((await agent.get("/api/tags/recent")).body).tags;

  it("saves a session's tag, tidied", async () => {
    const agent = await signIn();

    const session = await tagged(agent, "  Leet   Code ");

    expect(session.tag).toBe("Leet Code");
  });

  it("refuses a tag over 32 characters (400)", async () => {
    const agent = await signIn();

    const res = await agent
      .post("/api/sessions")
      .send({ id: randomUUID(), plannedMinutes: 25, tag: "x".repeat(33) });

    expect(res.status).toBe(400);
    expect(apiError(res).fields).toHaveProperty("tag");
  });

  it("lists recent tags newest first, one per tag whatever the case, in the newest spelling", async () => {
    const agent = await signIn();
    for (const tag of ["aws", "LeetCode", "AWS", "Rust"]) await tagged(agent, tag);

    expect(await recent(agent)).toEqual(["Rust", "AWS", "LeetCode"]);
  });

  it("offers at most 8, and only the signed-in user's", async () => {
    const ana = await signIn();
    const ben = await signIn("ben@example.com");
    for (let i = 1; i <= 10; i++) await tagged(ana, `topic ${i}`);
    await tagged(ben, "Ben's secret project");

    const tags = await recent(ana);

    expect(tags).toHaveLength(8);
    expect(tags[0]).toBe("topic 10");
    expect(tags).not.toContain("Ben's secret project");
  });

  // The database refuses messy tags even if something skipped the API.
  it.each([" AWS", "AWS ", "Leet  Code", "Leet\tCode", "x".repeat(33)])(
    "the database refuses the untidy tag %j",
    async (tag) => {
      const user = await prisma.user.create({
        data: { email: "db@example.com", passwordHash: "hash", displayName: "Db" },
      });

      await expect(
        prisma.focusSession.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            plannedMinutes: 25,
            startedAt: new Date(T0),
            status: "RUNNING",
            tag,
          },
        }),
      ).rejects.toThrow(/focus_sessions_tag_tidy/);
    },
  );
});

describe("authentication", () => {
  it.each([
    ["POST", "/api/sessions"],
    ["POST", `/api/sessions/${randomUUID()}/complete`],
    ["POST", `/api/sessions/${randomUUID()}/abandon`],
    ["GET", "/api/sessions"],
    ["GET", "/api/climb"],
    ["GET", "/api/tags/recent"],
    ["POST", "/api/sessions/import"],
  ])("%s %s requires sign-in (401)", async (method, path) => {
    const req = method === "GET" ? request(app).get(path) : request(app).post(path);

    const res = await req;

    expect(res.status).toBe(401);
    expect(apiError(res).code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/sessions/import (guest history)", () => {
  /** A finished guest session from the day before the test, as Phase 1 stored them. */
  function guestSession(start: string, overrides: Partial<FocusSession> = {}): FocusSession {
    const status = overrides.status ?? "COMPLETED";
    const plannedMinutes = overrides.plannedMinutes ?? 25;
    return {
      id: randomUUID(),
      plannedMinutes,
      startedAt: start,
      endedAt: new Date(Date.parse(start) + plannedMinutes * MIN).toISOString(),
      status,
      tag: null,
      metersGained: status === "COMPLETED" ? plannedMinutes * 10 : 0,
      roomId: null,
      ...overrides,
    };
  }

  const importResult = (res: Response) => ImportResultSchema.parse(res.body);

  it("imports guest sessions, flags them, and counts them toward the climb", async () => {
    const agent = await signIn();
    const sessions = [
      guestSession("2026-10-17T09:00:00.000Z"),
      guestSession("2026-10-17T10:00:00.000Z"),
      guestSession("2026-10-17T11:00:00.000Z", {
        status: "ABANDONED",
        endedAt: "2026-10-17T11:07:00.000Z",
      }),
    ];

    const res = await agent.post("/api/sessions/import").send({ sessions });

    expect(res.status).toBe(200);
    expect(importResult(res)).toEqual({ imported: 3, skipped: 0 });
    await expect(prisma.focusSession.count({ where: { imported: true } })).resolves.toBe(3);
    expect(getCurrentClimb(await climb(agent))?.climb.metersGained).toBe(500);
    const page = SessionPageSchema.parse((await agent.get("/api/sessions")).body);
    expect(page.sessions).toHaveLength(3);
  });

  // The device may retry, or the user may click "Import" twice.
  it("is safe to repeat: already-imported sessions are skipped", async () => {
    const agent = await signIn();
    const sessions = [guestSession("2026-10-17T09:00:00.000Z")];
    await agent.post("/api/sessions/import").send({ sessions });

    const again = await agent.post("/api/sessions/import").send({ sessions });

    expect(importResult(again)).toEqual({ imported: 0, skipped: 1 });
    expect(getCurrentClimb(await climb(agent))?.climb.metersGained).toBe(250);
  });

  it("can't claim ids that belong to another user's sessions", async () => {
    const ana = await signIn("ana@example.com");
    const ben = await signIn("ben@example.com");
    const anasSession = guestSession("2026-10-17T09:00:00.000Z");
    await ana.post("/api/sessions/import").send({ sessions: [anasSession] });

    const res = await ben.post("/api/sessions/import").send({ sessions: [anasSession] });

    expect(importResult(res)).toEqual({ imported: 0, skipped: 1 });
    const row = await prisma.focusSession.findUniqueOrThrow({ where: { id: anasSession.id } });
    expect(row.metersGained).toBe(250); // Ana's session is untouched
  });

  it("skips guest sessions that overlap sessions the account already has", async () => {
    const agent = await signIn();
    await focus(agent); // a live session from 09:00 to 09:25 on the test day
    clock = T0 + 2 * 60 * MIN;

    const res = await agent
      .post("/api/sessions/import")
      .send({ sessions: [guestSession("2026-10-18T09:10:00.000Z")] });

    expect(importResult(res)).toEqual({ imported: 0, skipped: 1 });
  });

  it("imports a full batch of 1,000 sessions in one request", async () => {
    const agent = await signIn();
    const sessions = Array.from({ length: MAX_IMPORT_SESSIONS }, (_, i) =>
      guestSession(new Date(Date.parse("2026-09-01T00:00:00.000Z") + i * 2 * MIN).toISOString(), {
        plannedMinutes: 1,
      }),
    );

    const res = await agent.post("/api/sessions/import").send({ sessions });

    expect(importResult(res)).toEqual({ imported: 1000, skipped: 0 });
    // 10,000 m summits Fuji and Rainier, so check the total across all peaks.
    const progress = await climb(agent);
    const totalMeters = progress.climbs.reduce((sum, c) => sum + c.metersGained, 0);
    expect(totalMeters).toBe(1000 * 10);
  });

  it.each([
    ["an empty list", { sessions: [] }],
    [
      "more than the maximum",
      { sessions: Array.from({ length: MAX_IMPORT_SESSIONS + 1 }, () => ({})) },
    ],
  ])("rejects %s (400)", async (_label, body) => {
    const agent = await signIn();

    const res = await agent.post("/api/sessions/import").send(body);

    expect(res.status).toBe(400);
  });

  // The shared schema refuses inconsistent data before any rule runs.
  it("rejects a session claiming meters it didn't earn (400)", async () => {
    const agent = await signIn();
    const tampered = { ...guestSession("2026-10-17T09:00:00.000Z"), metersGained: 99_999 };

    const res = await agent.post("/api/sessions/import").send({ sessions: [tampered] });

    expect(res.status).toBe(400);
    await expect(prisma.focusSession.count()).resolves.toBe(0);
  });
});
