// Integration tests for GET /api/stats: the real SQL against the real test
// database, with sessions inserted at exact moments and a fixed clock.
import { metersEarned, StatsResponseSchema, type Stats } from "@summit/shared";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { testConfig } from "../test/config";
import { createTestPrisma, resetDatabase } from "../test/db";
import { apiError } from "../test/http";

const prisma = createTestPrisma();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** "Now" for the server: 2026-10-21 19:00 UTC, which is noon in Vancouver (UTC−7 in October). */
const NOW = Date.parse("2026-10-21T19:00:00.000Z");
let clock = NOW;

const app = createApp({
  config: testConfig,
  prisma,
  authRateLimit: { windowMs: 60_000, limit: 1000 },
  now: () => new Date(clock),
});

beforeEach(async () => {
  await resetDatabase(prisma);
  clock = NOW;
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Registers a user; returns their signed-in agent and id. */
async function signIn(email = "ana@example.com") {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .send({ email, password: "correct horse battery", displayName: "Ana" });
  return { agent, userId: (res.body as { user: { id: string } }).user.id };
}

/** Inserts a finished session that started at `startedAt` (an ISO time or ms). */
async function addSession(
  userId: string,
  startedAt: string | number,
  {
    minutes = 25,
    status = "COMPLETED",
    tag = null,
  }: {
    minutes?: number;
    status?: "COMPLETED" | "ABANDONED";
    tag?: string | null;
  } = {},
) {
  const start = new Date(startedAt);
  await prisma.focusSession.create({
    data: {
      id: randomUUID(),
      userId,
      plannedMinutes: minutes,
      startedAt: start,
      endedAt: new Date(start.getTime() + minutes * MIN),
      status,
      tag,
      metersGained: metersEarned(status, minutes),
    },
  });
}

/** Noon in Vancouver on the given October day (19:00 UTC), `daysAgo` days before NOW. */
const vancouverNoon = (daysAgo: number) => NOW - daysAgo * DAY;

async function statsFor(agent: request.Agent, tz = "America/Vancouver"): Promise<Stats> {
  const res = await agent.get("/api/stats").query({ tz });
  expect(res.status).toBe(200);
  return StatsResponseSchema.parse(res.body).stats;
}

describe("GET /api/stats", () => {
  it("is all zeros for a new account", async () => {
    const { agent } = await signIn();

    expect(await statsFor(agent)).toEqual({
      timeZone: "America/Vancouver",
      today: "2026-10-21",
      totals: { focusMinutes: 0, completedSessions: 0, abandonedSessions: 0 },
      streak: { current: 0, longest: 0 },
      days: [],
      byHour: Array.from({ length: 24 }, () => 0),
      byTag: [],
    });
  });

  it("counts completed minutes; given-up sessions are only counted, never charted", async () => {
    const { agent, userId } = await signIn();
    await addSession(userId, vancouverNoon(0), { minutes: 25 });
    await addSession(userId, vancouverNoon(0) + 30 * MIN, { minutes: 50 });
    await addSession(userId, vancouverNoon(0) + 90 * MIN, { minutes: 25, status: "ABANDONED" });

    const stats = await statsFor(agent);

    expect(stats.totals).toEqual({ focusMinutes: 75, completedSessions: 2, abandonedSessions: 1 });
    expect(stats.days).toEqual([{ date: "2026-10-21", focusMinutes: 75, sessions: 2 }]);
    expect(stats.byHour.reduce((a, b) => a + b)).toBe(75);
  });

  it("only counts the signed-in user's sessions", async () => {
    const ana = await signIn();
    const ben = await signIn("ben@example.com");
    await addSession(ben.userId, vancouverNoon(0));

    expect((await statsFor(ana.agent)).totals.completedSessions).toBe(0);
  });
});

describe("time zones", () => {
  // 06:30 UTC on Oct 21 is 23:30 on Oct 20 in Vancouver, and 12:00 on Oct 21 in Kolkata.
  it.each([
    ["America/Vancouver", "2026-10-20", 23],
    ["UTC", "2026-10-21", 6],
    ["Asia/Kolkata", "2026-10-21", 12],
  ])("puts a session on its local day and hour in %s", async (tz, date, hour) => {
    const { agent, userId } = await signIn();
    await addSession(userId, "2026-10-21T06:30:00.000Z");

    const stats = await statsFor(agent, tz);

    expect(stats.days.map((d) => d.date)).toEqual([date]);
    expect(stats.byHour[hour]).toBe(25);
  });

  // Los Angeles's clocks go back at 02:00 on Nov 1, 2026 (PDT, UTC−7 → PST, UTC−8).
  // (Not Vancouver: British Columbia stopped changing its clocks in 2026,
  // which the time zone database knows and a hard-coded offset wouldn't.)
  it("follows daylight saving, not a fixed offset", async () => {
    clock = Date.parse("2026-11-02T20:00:00.000Z");
    const { agent, userId } = await signIn();
    await addSession(userId, "2026-11-01T07:30:00.000Z"); // 00:30 PDT
    await addSession(userId, "2026-11-01T09:30:00.000Z"); // 01:30 PST (a fixed −7 would say 02:30)
    await addSession(userId, "2026-07-01T16:00:00.000Z"); // 09:00 PDT in summer

    const stats = await statsFor(agent, "America/Los_Angeles");

    expect(stats.byHour[0]).toBe(25);
    expect(stats.byHour[1]).toBe(25);
    expect(stats.byHour[2]).toBe(0);
    expect(stats.byHour[9]).toBe(25);
  });

  it("refuses an unknown time zone (400) and a missing one", async () => {
    const { agent } = await signIn();

    const unknown = await agent.get("/api/stats").query({ tz: "Mars/Olympus_Mons" });
    const missing = await agent.get("/api/stats");

    expect(unknown.status).toBe(400);
    expect(apiError(unknown).fields).toEqual({ tz: "Unknown time zone." });
    expect(missing.status).toBe(400);
  });

  it("requires sign-in (401)", async () => {
    const res = await request(app).get("/api/stats").query({ tz: "UTC" });

    expect(res.status).toBe(401);
  });
});

describe("streaks", () => {
  it("counts the current run of days through today, and the longest run ever", async () => {
    const { agent, userId } = await signIn();
    // An older 5-day run (Oct 1–5), a gap, then Oct 19, 20, 21.
    for (const daysAgo of [20, 19, 18, 17, 16]) await addSession(userId, vancouverNoon(daysAgo));
    for (const daysAgo of [2, 1, 0]) await addSession(userId, vancouverNoon(daysAgo));

    expect((await statsFor(agent)).streak).toEqual({ current: 3, longest: 5 });
  });

  // Today isn't over: a streak isn't broken until a whole day passes without focus.
  it("keeps the streak alive when the last session was yesterday", async () => {
    const { agent, userId } = await signIn();
    for (const daysAgo of [2, 1]) await addSession(userId, vancouverNoon(daysAgo));

    expect((await statsFor(agent)).streak).toEqual({ current: 2, longest: 2 });
  });

  it("drops the current streak after a missed day, keeping the longest", async () => {
    const { agent, userId } = await signIn();
    for (const daysAgo of [4, 3, 2]) await addSession(userId, vancouverNoon(daysAgo));

    expect((await statsFor(agent)).streak).toEqual({ current: 0, longest: 3 });
  });

  it("counts several sessions on one day as one day, and ignores given-up days", async () => {
    const { agent, userId } = await signIn();
    await addSession(userId, vancouverNoon(1));
    await addSession(userId, vancouverNoon(1) + 60 * MIN);
    await addSession(userId, vancouverNoon(0), { status: "ABANDONED" });

    expect((await statsFor(agent)).streak).toEqual({ current: 1, longest: 1 });
  });

  // 23:30 on Oct 20 and noon on Oct 21 in Vancouver are two days; in UTC both are Oct 21.
  it("decides days in the user's time zone", async () => {
    const { agent, userId } = await signIn();
    await addSession(userId, "2026-10-21T06:30:00.000Z");
    await addSession(userId, vancouverNoon(0));

    expect((await statsFor(agent, "America/Vancouver")).streak.current).toBe(2);
    expect((await statsFor(agent, "UTC")).streak.current).toBe(1);
  });
});

describe("heatmap days", () => {
  it("covers the last 365 days, oldest first, while totals count everything", async () => {
    const { agent, userId } = await signIn();
    await addSession(userId, vancouverNoon(400));
    await addSession(userId, vancouverNoon(365)); // one day too old
    await addSession(userId, vancouverNoon(364)); // the first day shown
    await addSession(userId, vancouverNoon(0));

    const stats = await statsFor(agent);

    expect(stats.days.map((d) => d.date)).toEqual(["2025-10-22", "2026-10-21"]);
    expect(stats.totals.completedSessions).toBe(4);
  });
});

describe("time per tag", () => {
  it("groups tags whatever their case, shows the newest spelling, and sorts by minutes", async () => {
    const { agent, userId } = await signIn();
    await addSession(userId, vancouverNoon(3), { tag: "aws", minutes: 25 });
    await addSession(userId, vancouverNoon(2), { tag: "AWS", minutes: 50 });
    await addSession(userId, vancouverNoon(1), { tag: "LeetCode", minutes: 25 });
    await addSession(userId, vancouverNoon(0), { minutes: 15 });
    await addSession(userId, vancouverNoon(0) + 60 * MIN, { tag: "LeetCode", status: "ABANDONED" });

    expect((await statsFor(agent)).byTag).toEqual([
      { tag: "AWS", focusMinutes: 75, sessions: 2 },
      { tag: "LeetCode", focusMinutes: 25, sessions: 1 },
      { tag: null, focusMinutes: 15, sessions: 1 },
    ]);
  });
});
