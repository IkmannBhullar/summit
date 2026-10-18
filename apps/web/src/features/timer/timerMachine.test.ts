// Tests for the pure timer state machine. No fake timers needed: time is
// just a number we pass in with each action.
import { DEFAULT_TIMER_SETTINGS, FocusSessionSchema, type TimerSettings } from "@summit/shared";
import { describe, expect, it } from "vitest";
import {
  durationMsFor,
  INITIAL_TIMER_STATE,
  transition,
  type TimerAction,
  type TimerState,
} from "./timerMachine";

const MIN = 60_000;
const T0 = Date.parse("2026-10-17T09:00:00.000Z");
const settings: TimerSettings = DEFAULT_TIMER_SETTINGS; // 25 / 5 / 15, long break every 4
const ID = "11111111-2222-4333-8444-555555555555";

/** Runs a sequence of actions from a starting state, collecting every event. */
function run(actions: TimerAction[], from: TimerState = INITIAL_TIMER_STATE, s = settings) {
  let state = from;
  const events = [];
  for (const action of actions) {
    const result = transition(state, action, s);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

/** Start a focus session at T0 and let it finish. */
const focusDone = (at = T0): TimerAction[] => [
  { type: "START", now: at, sessionId: ID },
  { type: "TICK", now: at + 25 * MIN },
];

describe("durationMsFor", () => {
  it("maps each mode to its setting", () => {
    expect(durationMsFor("focus", settings)).toBe(25 * MIN);
    expect(durationMsFor("shortBreak", settings)).toBe(5 * MIN);
    expect(durationMsFor("longBreak", settings)).toBe(15 * MIN);
  });
});

describe("starting", () => {
  it("sets endsAt = start time + duration", () => {
    const { state } = run([{ type: "START", now: T0, sessionId: ID }]);

    expect(state).toMatchObject({ status: "running", mode: "focus", endsAt: T0 + 25 * MIN });
  });

  it("ignores START when already running", () => {
    const first = run([{ type: "START", now: T0, sessionId: ID }]).state;

    const result = transition(
      first,
      { type: "START", now: T0 + MIN, sessionId: "other" },
      settings,
    );

    expect(result.state).toBe(first); // same object: nothing changed
  });
});

describe("ticking", () => {
  it("does nothing before endsAt", () => {
    const running = run([{ type: "START", now: T0, sessionId: ID }]).state;

    const result = transition(running, { type: "TICK", now: T0 + 25 * MIN - 1 }, settings);

    expect(result.state).toBe(running);
    expect(result.events).toEqual([]);
  });

  it("completes the focus session exactly at endsAt", () => {
    const { state, events } = run(focusDone());

    expect(state).toEqual({ status: "idle", mode: "shortBreak", completedFocusCount: 1 });
    expect(events).toEqual([
      {
        type: "focusCompleted",
        session: {
          id: ID,
          plannedMinutes: 25,
          startedAt: "2026-10-17T09:00:00.000Z",
          endedAt: "2026-10-17T09:25:00.000Z",
          status: "COMPLETED",
          tag: null,
          metersGained: 250,
          roomId: null,
        },
      },
    ]);
  });

  // The background-tab case at the pure level: we notice two hours late.
  it("records endedAt as the scheduled end, not when the tick finally arrived", () => {
    const { events } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "TICK", now: T0 + 120 * MIN },
    ]);

    expect(events[0]).toMatchObject({
      type: "focusCompleted",
      session: { endedAt: "2026-10-17T09:25:00.000Z" },
    });
  });

  it("produces sessions that pass the shared FocusSession schema", () => {
    const { events } = run(focusDone());

    const session = events[0]?.type === "focusCompleted" ? events[0].session : undefined;
    expect(FocusSessionSchema.safeParse(session).success).toBe(true);
  });
});

describe("pausing and resuming", () => {
  it("freezes the remaining time while paused", () => {
    const { state } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "PAUSE", now: T0 + 10 * MIN },
    ]);

    expect(state).toMatchObject({ status: "paused", remainingMs: 15 * MIN });
  });

  it("resumes with a fresh endsAt, so paused time doesn't count", () => {
    const { state } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "PAUSE", now: T0 + 10 * MIN },
      // A 30-minute coffee break later...
      { type: "RESUME", now: T0 + 40 * MIN },
    ]);

    expect(state).toMatchObject({ status: "running", endsAt: T0 + 55 * MIN, startedAt: T0 });
  });

  it("allows unlimited pauses without losing any elevation", () => {
    const pausesAndResumes: TimerAction[] = [];
    for (let i = 1; i <= 5; i++) {
      pausesAndResumes.push({ type: "PAUSE", now: T0 + i * MIN });
      pausesAndResumes.push({ type: "RESUME", now: T0 + i * MIN });
    }
    const { events } = run([
      { type: "START", now: T0, sessionId: ID },
      ...pausesAndResumes,
      { type: "TICK", now: T0 + 25 * MIN },
    ]);

    expect(events).toMatchObject([{ type: "focusCompleted", session: { metersGained: 250 } }]);
  });

  it("never completes while paused, however much time passes", () => {
    const { state, events } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "PAUSE", now: T0 + MIN },
      { type: "TICK", now: T0 + 999 * MIN },
    ]);

    expect(state.status).toBe("paused");
    expect(events).toEqual([]);
  });

  it("treats PAUSE after the time is up as completion", () => {
    const { state, events } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "PAUSE", now: T0 + 30 * MIN },
    ]);

    expect(state.mode).toBe("shortBreak");
    expect(events[0]?.type).toBe("focusCompleted");
  });

  it("ignores PAUSE when idle and RESUME when running", () => {
    expect(transition(INITIAL_TIMER_STATE, { type: "PAUSE", now: T0 }, settings).state).toBe(
      INITIAL_TIMER_STATE,
    );
    const running = run([{ type: "START", now: T0, sessionId: ID }]).state;
    expect(transition(running, { type: "RESUME", now: T0 }, settings).state).toBe(running);
  });
});

describe("giving up", () => {
  it("abandons the session with 0 m and returns to idle focus", () => {
    const { state, events } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "GIVE_UP", now: T0 + 20 * MIN },
    ]);

    expect(state).toEqual({ status: "idle", mode: "focus", completedFocusCount: 0 });
    expect(events).toMatchObject([
      {
        type: "focusAbandoned",
        session: { status: "ABANDONED", metersGained: 0, endedAt: "2026-10-17T09:20:00.000Z" },
      },
    ]);
  });

  it("can give up while paused", () => {
    const { events } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "PAUSE", now: T0 + 5 * MIN },
      { type: "GIVE_UP", now: T0 + 6 * MIN },
    ]);

    expect(events[0]?.type).toBe("focusAbandoned");
  });

  // Fairness: if the time already ran out, the session was earned.
  it("counts the session as completed if its time was already up", () => {
    const { events } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "GIVE_UP", now: T0 + 26 * MIN },
    ]);

    expect(events[0]?.type).toBe("focusCompleted");
  });

  it("doesn't count abandoned sessions toward the long break", () => {
    const { state } = run([
      { type: "START", now: T0, sessionId: ID },
      { type: "GIVE_UP", now: T0 + MIN },
    ]);

    expect(state.completedFocusCount).toBe(0);
  });

  it("ignores GIVE_UP during a break", () => {
    const onBreak = run([...focusDone(), { type: "START", now: T0 + 26 * MIN, sessionId: ID }]);

    const result = transition(onBreak.state, { type: "GIVE_UP", now: T0 + 27 * MIN }, settings);

    expect(result.state).toBe(onBreak.state);
  });
});

describe("the focus / break cycle", () => {
  it("goes focus → short break → focus", () => {
    const { state, events } = run([
      ...focusDone(),
      { type: "START", now: T0 + 26 * MIN, sessionId: ID },
      { type: "TICK", now: T0 + 31 * MIN },
    ]);

    expect(state).toEqual({ status: "idle", mode: "focus", completedFocusCount: 1 });
    expect(events.map((event) => event.type)).toEqual(["focusCompleted", "breakCompleted"]);
  });

  it("gives a long break after every 4th focus session", () => {
    let state: TimerState = INITIAL_TIMER_STATE;
    const breaksSeen: string[] = [];
    let now = T0;

    for (let i = 1; i <= 8; i++) {
      state = run(focusDone(now), state).state;
      breaksSeen.push(state.mode);
      now += 25 * MIN;
      state = run([{ type: "SKIP_BREAK", now }], state).state;
    }

    expect(breaksSeen).toEqual([
      "shortBreak",
      "shortBreak",
      "shortBreak",
      "longBreak",
      "shortBreak",
      "shortBreak",
      "shortBreak",
      "longBreak",
    ]);
  });

  it("respects a custom long-break interval", () => {
    const everyOther: TimerSettings = { ...settings, longBreakEvery: 2 };
    let state: TimerState = INITIAL_TIMER_STATE;

    state = run([...focusDone(), { type: "SKIP_BREAK", now: T0 }], state, everyOther).state;
    state = run(focusDone(T0 + 30 * MIN), state, everyOther).state;

    expect(state.mode).toBe("longBreak");
  });

  it("skips a break straight to idle focus without recording anything", () => {
    const { state, events } = run([...focusDone(), { type: "SKIP_BREAK", now: T0 + 26 * MIN }]);

    expect(state).toMatchObject({ status: "idle", mode: "focus" });
    expect(events.map((event) => event.type)).toEqual(["focusCompleted"]);
  });

  it("ignores SKIP_BREAK during focus", () => {
    expect(transition(INITIAL_TIMER_STATE, { type: "SKIP_BREAK", now: T0 }, settings).state).toBe(
      INITIAL_TIMER_STATE,
    );
  });
});

describe("settings changes", () => {
  // The length is locked in at START, so editing settings can't shorten a session.
  it("don't affect a session that's already running", () => {
    const running = run([{ type: "START", now: T0, sessionId: ID }]).state;
    const shorter: TimerSettings = { ...settings, focusMinutes: 1 };

    const result = transition(running, { type: "TICK", now: T0 + 2 * MIN }, shorter);

    expect(result.state).toBe(running);
  });
});
