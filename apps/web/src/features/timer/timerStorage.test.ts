// Tests for saving and restoring the timer, including tampered data.
import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_TIMER_STATE, type TimerState } from "./timerMachine";
import { loadTimerState, saveTimerState } from "./timerStorage";

const MIN = 60_000;
const T0 = Date.parse("2026-10-17T09:00:00.000Z");
const ID = "11111111-2222-4333-8444-555555555555";

const running: TimerState = {
  status: "running",
  mode: "focus",
  completedFocusCount: 2,
  sessionId: ID,
  startedAt: T0,
  durationMs: 25 * MIN,
  endsAt: T0 + 25 * MIN,
};

afterEach(() => {
  vi.restoreAllMocks();
});

/** Writes raw JSON directly, the way an old version or a hand edit would. */
const writeRaw = (value: unknown) => localStorage.setItem("summit:timer", JSON.stringify(value));

describe("timer storage", () => {
  it("starts idle when nothing is saved", () => {
    expect(loadTimerState()).toEqual(INITIAL_TIMER_STATE);
  });

  it.each<[string, TimerState]>([
    ["idle", { status: "idle", mode: "shortBreak", completedFocusCount: 1 }],
    ["running", running],
    // Pausing for 10 minutes pushes endsAt later; that's allowed.
    ["running after a pause", { ...running, endsAt: T0 + 35 * MIN }],
    [
      "paused",
      {
        status: "paused",
        mode: "focus",
        completedFocusCount: 0,
        sessionId: ID,
        startedAt: T0,
        durationMs: 25 * MIN,
        remainingMs: 10 * MIN,
      },
    ],
  ])("round-trips a %s timer", (_label, state) => {
    saveTimerState(state);

    expect(loadTimerState()).toEqual(state);
  });

  describe("rejects invalid or tampered data", () => {
    it.each([
      // Someone edits endsAt to finish a 25-minute session after 1 minute.
      ["endsAt moved earlier", { ...running, endsAt: T0 + MIN }],
      ["an unknown status", { ...running, status: "sprinting" }],
      ["an unknown mode", { ...running, mode: "nap" }],
      ["a non-UUID session id", { ...running, sessionId: "abc" }],
      ["an absurd duration", { ...running, durationMs: 999 * MIN, endsAt: T0 + 999 * MIN }],
      [
        "a paused timer with more time left than its length",
        {
          ...running,
          status: "paused",
          remainingMs: 26 * MIN,
        },
      ],
    ])("%s", (_label, bad) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      writeRaw(bad);

      expect(loadTimerState()).toEqual(INITIAL_TIMER_STATE);
    });
  });
});
