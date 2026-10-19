// Tests against the real test database: the seed, relations, and the
// hand-written CHECK constraints from the first migration.
import { PEAKS } from "@summit/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrisma, resetDatabase } from "../test/db";

const prisma = createTestPrisma();

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const T0 = new Date("2026-10-18T09:00:00.000Z");
const T25 = new Date("2026-10-18T09:25:00.000Z");
let counter = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

/** Creates a user to own test sessions. */
const createUser = (email = "ana@example.com") =>
  prisma.user.create({ data: { email, passwordHash: "hash", displayName: "Ana" } });

/** A valid completed 25-minute session for `userId`; tests override one field. */
const completedSession = (userId: string) => ({
  id: nextId(),
  userId,
  plannedMinutes: 25,
  startedAt: T0,
  endedAt: T25,
  status: "COMPLETED" as const,
  metersGained: 250,
});

describe("seeded peaks", () => {
  it("match PEAKS from packages/shared", async () => {
    const rows = await prisma.peak.findMany({ orderBy: { order: "asc" } });

    expect(rows).toEqual(
      PEAKS.map(({ id, name, heightMeters, region, order }) => ({
        id,
        name,
        heightMeters,
        region,
        order,
      })),
    );
  });
});

describe("users", () => {
  it("refuses a second account with the same email", async () => {
    await createUser();

    await expect(createUser()).rejects.toThrow(/Unique constraint/);
  });

  // The API lowercases emails; the database double-checks it.
  it("refuses an email that isn't lowercase", async () => {
    await expect(createUser("Ana@Example.com")).rejects.toThrow(/users_email_lowercase/);
  });

  it("deleting a user deletes their sessions too", async () => {
    const user = await createUser();
    await prisma.focusSession.create({ data: completedSession(user.id) });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.focusSession.count()).toBe(0);
  });
});

describe("focus session CHECK constraints", () => {
  it("accepts a valid completed session", async () => {
    const user = await createUser();

    await expect(
      prisma.focusSession.create({ data: completedSession(user.id) }),
    ).resolves.toMatchObject({ metersGained: 250 });
  });

  it.each([
    ["focus_sessions_planned_minutes_range", { plannedMinutes: 0 }],
    ["focus_sessions_planned_minutes_range", { plannedMinutes: 121 }],
    ["focus_sessions_meters_nonnegative", { metersGained: -5 }],
    [
      "focus_sessions_meters_only_when_completed",
      { status: "ABANDONED" as const, metersGained: 250 },
    ],
    ["focus_sessions_ended_at_matches_status", { endedAt: null }],
    ["focus_sessions_ended_at_matches_status", { status: "RUNNING" as const, metersGained: 0 }],
    ["focus_sessions_ends_after_start", { endedAt: new Date("2026-10-18T08:00:00.000Z") }],
  ])("%s rejects %o", async (constraint, override) => {
    const user = await createUser();

    await expect(
      prisma.focusSession.create({ data: { ...completedSession(user.id), ...override } }),
    ).rejects.toThrow(new RegExp(constraint));
  });

  it("allows a running session with no end time", async () => {
    const user = await createUser();

    await expect(
      prisma.focusSession.create({
        data: { ...completedSession(user.id), status: "RUNNING", endedAt: null, metersGained: 0 },
      }),
    ).resolves.toMatchObject({ status: "RUNNING" });
  });
});
