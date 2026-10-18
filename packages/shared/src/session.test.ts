// Tests for the FocusSession schema and the meters-per-session rule.
import { describe, expect, it } from "vitest";
import { FocusSessionSchema, metersEarned, type FocusSession } from "./session";

/** A valid completed 25-minute session; tests override one field at a time. */
const completed: FocusSession = {
  id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
  plannedMinutes: 25,
  startedAt: "2026-10-17T09:00:00.000Z",
  endedAt: "2026-10-17T09:25:00.000Z",
  status: "COMPLETED",
  tag: null,
  metersGained: 250,
  roomId: null,
};

/** Returns the error messages Zod reports, or [] if the session is valid. */
const issuesFor = (session: unknown): string[] =>
  FocusSessionSchema.safeParse(session).error?.issues.map((issue) => issue.message) ?? [];

describe("metersEarned", () => {
  it("gives a completed 25-minute session 250 m", () => {
    expect(metersEarned("COMPLETED", 25)).toBe(250);
  });

  // "You slid back down": giving up earns nothing.
  it("gives an abandoned session 0 m", () => {
    expect(metersEarned("ABANDONED", 25)).toBe(0);
  });

  it("gives unfinished sessions 0 m so far", () => {
    expect(metersEarned("PLANNED", 25)).toBe(0);
    expect(metersEarned("RUNNING", 25)).toBe(0);
  });
});

describe("FocusSessionSchema", () => {
  it("accepts a valid completed session", () => {
    expect(issuesFor(completed)).toEqual([]);
  });

  it("accepts a valid abandoned session with 0 m", () => {
    expect(issuesFor({ ...completed, status: "ABANDONED", metersGained: 0 })).toEqual([]);
  });

  it("accepts a running session with no end time", () => {
    expect(issuesFor({ ...completed, status: "RUNNING", endedAt: null, metersGained: 0 })).toEqual(
      [],
    );
  });

  it("rejects a finished session without endedAt", () => {
    expect(issuesFor({ ...completed, endedAt: null })).toContain(
      "A finished session needs endedAt",
    );
  });

  it("rejects ending before starting", () => {
    expect(issuesFor({ ...completed, endedAt: "2026-10-17T08:00:00.000Z" })).toContain(
      "endedAt is before startedAt",
    );
  });

  // Guards against tampered or buggy saved data claiming extra elevation.
  it.each([
    ["a completed session claiming extra meters", { metersGained: 9999 }],
    ["an abandoned session claiming meters", { status: "ABANDONED", metersGained: 250 }],
  ])("rejects %s", (_label, override) => {
    expect(issuesFor({ ...completed, ...override })).toContain(
      "metersGained doesn't match the session's status and length",
    );
  });

  it.each([
    ["a non-UUID id", { id: "session-1" }],
    ["an unknown status", { status: "PAUSED" }],
    ["a blank tag", { tag: "   " }],
    ["a 0-minute session", { plannedMinutes: 0, metersGained: 0 }],
  ])("rejects %s", (_label, override) => {
    expect(FocusSessionSchema.safeParse({ ...completed, ...override }).success).toBe(false);
  });
});
