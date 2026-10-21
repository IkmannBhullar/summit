// Tests for the room clock and the words for how a session ended.
import type { RoomPhase } from "@summit/shared";
import { describe, expect, it } from "vitest";
import { roomClock } from "./roomClock";
import { describeOutcome, teamAlertFor } from "./teamAlerts";

const T = Date.parse("2026-10-20T09:00:00.000Z");
const MIN = 60_000;
const focus: RoomPhase = {
  kind: "focus",
  sessionId: "00000000-0000-4000-8000-000000000001",
  plannedMinutes: 25,
  startsAt: new Date(T + 3_000).toISOString(),
  endsAt: new Date(T + 3_000 + 25 * MIN).toISOString(),
};

describe("roomClock", () => {
  it("counts down to the start", () => {
    expect(roomClock(focus, T)).toEqual({ kind: "countdown", msLeft: 3_000 });
  });

  it("shows the focus time left and how far along it is", () => {
    expect(roomClock(focus, T + 3_000 + 10 * MIN)).toEqual({
      kind: "focus",
      msLeft: 15 * MIN,
      fractionDone: 0.4,
    });
  });

  // The server ends the session; until its snapshot arrives, hold at zero.
  it("never goes below zero or past 100%", () => {
    expect(roomClock(focus, T + 3_000 + 26 * MIN)).toEqual({
      kind: "focus",
      msLeft: 0,
      fractionDone: 1,
    });
  });

  it("shows the break time left", () => {
    const breakPhase: RoomPhase = { kind: "break", endsAt: new Date(T + 5 * MIN).toISOString() };

    expect(roomClock(breakPhase, T + MIN)).toEqual({ kind: "break", msLeft: 4 * MIN });
  });

  it("has nothing to time when idle", () => {
    expect(roomClock({ kind: "idle" }, T)).toEqual({ kind: "idle" });
  });
});

describe("team outcomes", () => {
  const at = "2026-10-20T09:25:03.000Z";

  it("celebrates a completed session, with a chime", () => {
    const outcome = { kind: "completed", metersEach: 250, at } as const;

    expect(teamAlertFor(outcome)).toEqual({
      chime: "focusEnd",
      title: "Team session complete!",
      body: "Summit push complete: +250 m each.",
    });
  });

  it.each([
    ["left", "Ben left, so the rope team slipped. No meters this time."],
    ["gave_up", "Ben gave up, so the rope team slipped. No meters this time."],
    ["disconnected", "Ben lost their connection, so the rope team slipped. No meters this time."],
  ] as const)("explains a slip because someone %s, without a chime", (reason, text) => {
    const outcome = { kind: "slipped", displayName: "Ben", reason, at } as const;

    expect(describeOutcome(outcome)).toBe(text);
    expect(teamAlertFor(outcome).chime).toBeNull();
  });
});
