// Unit tests for the import rules: no database needed.
import type { FocusSession } from "@summit/shared";
import { describe, expect, it } from "vitest";
import { CLOCK_SKEW_TOLERANCE_MS, selectImportable, type Interval } from "./importRules";

const MIN = 60_000;
const SIGNUP = new Date("2026-10-18T12:00:00.000Z");
const NOW = new Date("2026-10-18T12:30:00.000Z");
let counter = 0;

/** A completed 25-minute session starting at `start` (ISO); overrides tweak it. */
function session(start: string, overrides: Partial<FocusSession> = {}): FocusSession {
  const status = overrides.status ?? "COMPLETED";
  const plannedMinutes = overrides.plannedMinutes ?? 25;
  return {
    id: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
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

const run = (candidates: FocusSession[], existing: Interval[] = []) =>
  selectImportable(candidates, { accountCreatedAt: SIGNUP, now: NOW, existing });

const reasons = (result: ReturnType<typeof run>) => result.skipped.map((s) => s.reason);

describe("selectImportable", () => {
  it("accepts finished solo sessions from before signup", () => {
    const result = run([
      session("2026-10-17T09:00:00.000Z"),
      session("2026-10-17T10:00:00.000Z", {
        status: "ABANDONED",
        endedAt: "2026-10-17T10:05:00.000Z",
      }),
    ]);

    expect(result.accepted).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  // The server never trusts the client's arithmetic.
  it("recalculates meters on the server", () => {
    const result = run([session("2026-10-17T09:00:00.000Z", { metersGained: 1 })]);

    expect(result.accepted[0]?.metersGained).toBe(250);
  });

  it.each<[string, FocusSession, string]>([
    [
      "unfinished",
      session("2026-10-17T09:00:00.000Z", { status: "RUNNING", endedAt: null }),
      "UNFINISHED",
    ],
    [
      "rope team",
      session("2026-10-17T09:00:00.000Z", { roomId: "11111111-2222-4333-8444-555555555555" }),
      "ROOM_SESSION",
    ],
    [
      "after signup",
      session("2026-10-18T12:01:00.000Z", { endedAt: "2026-10-18T12:26:00.000Z" }),
      "AFTER_SIGNUP",
    ],
    // A "completed" 25-minute session that took 3 minutes.
    [
      "impossibly short",
      session("2026-10-17T09:00:00.000Z", { endedAt: "2026-10-17T09:03:00.000Z" }),
      "TOO_SHORT",
    ],
  ])("skips a session that's %s", (_label, candidate, reason) => {
    expect(reasons(run([candidate]))).toEqual([reason]);
  });

  it("skips sessions ending in the future, allowing a few minutes of clock drift", () => {
    const endsSlightlyAhead = new Date(NOW.getTime() + CLOCK_SKEW_TOLERANCE_MS - MIN);
    const endsFarAhead = new Date(NOW.getTime() + 60 * MIN);
    const start = (end: Date) => new Date(end.getTime() - 25 * MIN).toISOString();
    // Signup is in the future relative to these, so AFTER_SIGNUP doesn't interfere.
    const result = selectImportable(
      [
        session(start(endsSlightlyAhead), { endedAt: endsSlightlyAhead.toISOString() }),
        session(start(endsFarAhead), { endedAt: endsFarAhead.toISOString() }),
      ],
      { accountCreatedAt: new Date("2030-01-01"), now: NOW, existing: [] },
    );

    expect(result.accepted).toHaveLength(1);
    expect(reasons(result)).toEqual(["IN_THE_FUTURE"]);
  });

  // You can't focus on two things at once.
  it("keeps the earlier of two overlapping sessions", () => {
    const first = session("2026-10-17T09:00:00.000Z");
    const overlapping = session("2026-10-17T09:10:00.000Z");

    const result = run([overlapping, first]); // order in the request doesn't matter

    expect(result.accepted.map((s) => s.id)).toEqual([first.id]);
    expect(result.skipped).toEqual([{ id: overlapping.id, reason: "OVERLAPS" }]);
  });

  it("allows sessions that touch end-to-start", () => {
    const result = run([session("2026-10-17T09:00:00.000Z"), session("2026-10-17T09:25:00.000Z")]);

    expect(result.accepted).toHaveLength(2);
  });

  it("skips sessions overlapping ones the account already has", () => {
    const existing = [
      {
        start: Date.parse("2026-10-17T09:00:00.000Z"),
        end: Date.parse("2026-10-17T09:25:00.000Z"),
      },
    ];

    const result = run([session("2026-10-17T09:20:00.000Z")], existing);

    expect(reasons(result)).toEqual(["OVERLAPS"]);
  });

  it("skips a repeated id within the same import", () => {
    const original = session("2026-10-17T09:00:00.000Z");

    const result = run([original, { ...original }]);

    expect(result.accepted).toHaveLength(1);
    expect(reasons(result)).toEqual(["DUPLICATE_ID"]);
  });

  // 1,000 back-to-back 2-hour sessions is far more than one day can hold.
  it("can't pack more focus into a day than the day has", () => {
    const sameMorning = Array.from({ length: 50 }, () =>
      session("2026-10-17T06:00:00.000Z", { plannedMinutes: 120 }),
    );

    const result = run(sameMorning);

    expect(result.accepted).toHaveLength(1);
    expect(result.skipped.every((s) => s.reason === "OVERLAPS")).toBe(true);
  });
});

describe("selectImportable for offline sessions", () => {
  const DAY = 24 * 60 * MIN;
  // A month after signing up.
  const LATER = new Date(SIGNUP.getTime() + 30 * DAY);
  const runOffline = (candidates: FocusSession[], existing: Interval[] = []) =>
    selectImportable(candidates, {
      accountCreatedAt: SIGNUP,
      now: LATER,
      existing,
      source: "offline",
    });
  const at = (msBeforeLater: number) => new Date(LATER.getTime() - msBeforeLater).toISOString();

  it("accepts a recent session from after sign-up (the opposite of guest history)", () => {
    const result = runOffline([session(at(2 * 60 * MIN))]);

    expect(result.accepted).toHaveLength(1);
  });

  it("refuses sessions from before sign-up", () => {
    const result = runOffline([session("2026-10-17T09:00:00.000Z")]);

    expect(reasons(result)).toEqual(["BEFORE_SIGNUP"]);
  });

  it("refuses sessions that ended more than 7 days ago", () => {
    const result = runOffline([session(at(7 * DAY + 30 * MIN)), session(at(6 * DAY))]);

    expect(reasons(result)).toEqual(["TOO_OLD"]);
    expect(result.accepted).toHaveLength(1);
  });

  // The checks that make any unwatched session plausible still apply.
  it("still refuses future, too-short, and overlapping sessions", () => {
    const result = runOffline(
      [
        session(at(-60 * MIN)), // ends in the future
        session(at(3 * 60 * MIN), { endedAt: at(3 * 60 * MIN - 3 * MIN) }), // "25 min" in 3
        session(at(5 * 60 * MIN)), // overlaps an existing session
      ],
      [{ start: LATER.getTime() - 5 * 60 * MIN, end: LATER.getTime() - 4 * 60 * MIN }],
    );

    expect(reasons(result).sort()).toEqual(["IN_THE_FUTURE", "OVERLAPS", "TOO_SHORT"]);
  });

  it("is still guest import by default", () => {
    // 12:01 is just after sign-up (12:00) and ends before the guest tests' "now" (12:30).
    expect(reasons(run([session("2026-10-18T12:01:00.000Z")]))).toEqual(["AFTER_SIGNUP"]);
  });
});
