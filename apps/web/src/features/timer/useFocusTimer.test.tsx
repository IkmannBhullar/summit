// Tests for useFocusTimer with Vitest's fake timers.
//
// Fake timers replace setInterval/setTimeout *and* Date with a controllable
// clock:
// - vi.advanceTimersByTime(ms) moves the clock AND fires any timers that come due.
// - vi.setSystemTime(t) moves the clock WITHOUT firing timers. That's exactly
//   what a throttled background tab looks like: time passes, the interval doesn't run.
import { DEFAULT_TIMER_SETTINGS, type TimerSettings } from "@summit/shared";
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimerEvent, TimerState } from "./timerMachine";
import { useFocusTimer, type UseFocusTimerOptions } from "./useFocusTimer";

const MIN = 60_000;
const T0 = Date.parse("2026-10-17T09:00:00.000Z");
const ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  // Remove any visibilityState override a test added (see setVisibility).
  Reflect.deleteProperty(document, "visibilityState");
});

/** Renders the hook with default settings; returns the hook result plus an event spy. */
function setup(options: Partial<UseFocusTimerOptions> = {}, wrapper?: typeof StrictMode) {
  const onEvent = vi.fn<(event: TimerEvent) => void>();
  const rendered = renderHook((props: UseFocusTimerOptions) => useFocusTimer(props), {
    initialProps: { settings: DEFAULT_TIMER_SETTINGS, onEvent, createId: () => ID, ...options },
    wrapper,
  });
  return { ...rendered, onEvent };
}

/** Pretends the tab was hidden or shown, and fires the browser's event. */
function setVisibility(visibility: DocumentVisibilityState) {
  // jsdom's document.visibilityState is read-only, so shadow it on this object.
  Object.defineProperty(document, "visibilityState", { configurable: true, value: visibility });
  document.dispatchEvent(new Event("visibilitychange"));
}

/**
 * Moves the fake clock forward, firing due timers, inside act() so React
 * applies the resulting state updates before we assert.
 *
 * The block body matters: if the callback returned a value, act() would
 * treat it as async and hand back a Promise we'd have to await.
 */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

type EventSpy = ReturnType<typeof setup>["onEvent"];

/** The events about periods ending, in order (starts are tested separately). */
const endEvents = (onEvent: EventSpy) =>
  onEvent.mock.calls.map(([event]) => event).filter((event) => event.type !== "focusStarted");

/** The first "end" event the timer reported (typed, unlike expect.objectContaining). */
const firstEvent = (onEvent: EventSpy) => endEvents(onEvent)[0];

describe("useFocusTimer", () => {
  it("reports focusStarted once when a focus session starts", () => {
    const { result, onEvent } = setup();

    act(() => result.current.start());

    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual(["focusStarted"]);
  });

  it("shows the full focus length before starting", () => {
    const { result } = setup();

    expect(result.current.state.status).toBe("idle");
    expect(result.current.remainingMs).toBe(25 * MIN);
  });

  it("counts down from endsAt while running", () => {
    const { result } = setup();

    act(() => result.current.start());
    advance(10_000);

    expect(result.current.remainingMs).toBe(25 * MIN - 10_000);
  });

  it("completes on time, fires focusCompleted once, and moves to a short break", () => {
    const { result, onEvent } = setup();

    act(() => result.current.start());
    advance(25 * MIN);

    expect(endEvents(onEvent)).toHaveLength(1);
    expect(firstEvent(onEvent)).toMatchObject({
      type: "focusCompleted",
      session: { status: "COMPLETED", metersGained: 250 },
    });
    expect(result.current.state).toMatchObject({ status: "idle", mode: "shortBreak" });
  });

  it("freezes while paused and continues after resuming", () => {
    const { result, onEvent } = setup();

    act(() => result.current.start());
    advance(5 * MIN);
    act(() => result.current.pause());
    advance(60 * MIN); // a long lunch

    expect(result.current.remainingMs).toBe(20 * MIN);
    expect(endEvents(onEvent)).toHaveLength(0);

    act(() => result.current.resume());
    advance(20 * MIN);

    expect(endEvents(onEvent)).toHaveLength(1);
  });

  // The core background-tab scenario from CLAUDE.md.
  it("catches up correctly when a background tab becomes visible again", () => {
    const { result, onEvent } = setup();
    act(() => result.current.start());

    // The user switches tabs. The browser throttles our interval to nothing,
    // while 40 real minutes pass.
    act(() => {
      setVisibility("hidden");
      vi.setSystemTime(T0 + 40 * MIN);
    });

    // No interval ran, so nothing has noticed the session ended yet.
    expect(endEvents(onEvent)).toHaveLength(0);

    // The user comes back.
    act(() => setVisibility("visible"));

    expect(endEvents(onEvent)).toHaveLength(1);
    // endedAt is the scheduled end (09:25), not when we noticed (09:40).
    expect(firstEvent(onEvent)).toMatchObject({
      type: "focusCompleted",
      session: { startedAt: "2026-10-17T09:00:00.000Z", endedAt: "2026-10-17T09:25:00.000Z" },
    });
    expect(result.current.state.mode).toBe("shortBreak");
  });

  it("shows the correct remaining time after returning mid-session", () => {
    const { result } = setup();
    act(() => result.current.start());

    act(() => {
      setVisibility("hidden");
      vi.setSystemTime(T0 + 15 * MIN);
    });
    act(() => setVisibility("visible"));

    // No drift: exactly 10 minutes left, even though no ticks ran for 15 minutes.
    expect(result.current.remainingMs).toBe(10 * MIN);
  });

  it("ignores the event when the tab becomes hidden", () => {
    const { result, onEvent } = setup();
    act(() => result.current.start());

    act(() => {
      vi.setSystemTime(T0 + 30 * MIN);
      setVisibility("hidden");
    });

    expect(endEvents(onEvent)).toHaveLength(0);
  });

  it("records a give-up as an abandoned session worth 0 m", () => {
    const { result, onEvent } = setup();

    act(() => result.current.start());
    advance(12 * MIN);
    act(() => result.current.giveUp());

    expect(firstEvent(onEvent)).toMatchObject({
      type: "focusAbandoned",
      session: { status: "ABANDONED", metersGained: 0 },
    });
    expect(result.current.state).toMatchObject({ status: "idle", mode: "focus" });
  });

  it("uses new settings for the next period but never the running one", () => {
    const { result, rerender, onEvent } = setup();
    act(() => result.current.start());

    const shorter: TimerSettings = { ...DEFAULT_TIMER_SETTINGS, focusMinutes: 10 };
    rerender({ settings: shorter, onEvent, createId: () => ID });
    advance(10 * MIN);

    // Still running: this session was locked in at 25 minutes.
    expect(result.current.remainingMs).toBe(15 * MIN);

    act(() => result.current.giveUp());
    // Idle now, so the countdown shows the new 10-minute setting.
    expect(result.current.remainingMs).toBe(10 * MIN);
  });

  // StrictMode runs effects twice in development to expose bugs. Our events
  // have side effects (saving, sounds), so they must still fire exactly once.
  it("fires each event exactly once under React StrictMode", () => {
    const { result, onEvent } = setup({}, StrictMode);

    act(() => result.current.start());
    advance(25 * MIN);

    expect(endEvents(onEvent)).toHaveLength(1);
  });

  it("leaves no timers running after unmount", () => {
    const { result, unmount } = setup();
    act(() => result.current.start());
    expect(vi.getTimerCount()).toBe(1); // the tick interval

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("useFocusTimer restoring a saved session", () => {
  /** A focus session that started at T0 and was saved while running. */
  const savedRunning: TimerState = {
    status: "running",
    mode: "focus",
    completedFocusCount: 0,
    sessionId: ID,
    startedAt: T0,
    durationMs: 25 * MIN,
    endsAt: T0 + 25 * MIN,
  };

  it("continues a session that is still in progress", () => {
    vi.setSystemTime(T0 + 10 * MIN); // the page reloads 10 minutes in

    const { result, onEvent } = setup({ initialState: savedRunning });

    expect(result.current.state.status).toBe("running");
    expect(result.current.remainingMs).toBe(15 * MIN);
    expect(endEvents(onEvent)).toHaveLength(0);

    advance(15 * MIN);
    expect(endEvents(onEvent)).toHaveLength(1);
  });

  // Decision: a session that ran its full time while the page was closed counts.
  it("completes a session that ended while the page was closed, at its real end time", () => {
    vi.setSystemTime(T0 + 3 * 60 * MIN); // reopened 3 hours later

    const { result, onEvent } = setup({ initialState: savedRunning });

    expect(endEvents(onEvent)).toHaveLength(1);
    expect(firstEvent(onEvent)).toMatchObject({
      type: "focusCompleted",
      session: { endedAt: "2026-10-17T09:25:00.000Z", metersGained: 250 },
    });
    expect(result.current.state).toMatchObject({ status: "idle", mode: "shortBreak" });
  });

  it("completes it exactly once under StrictMode", () => {
    vi.setSystemTime(T0 + 60 * MIN);

    const { onEvent } = setup({ initialState: savedRunning }, StrictMode);

    expect(endEvents(onEvent)).toHaveLength(1);
  });

  it("keeps a paused session paused, however long the page was closed", () => {
    vi.setSystemTime(T0 + 24 * 60 * MIN);
    const { endsAt: _endsAt, ...rest } = savedRunning;
    const savedPaused: TimerState = { ...rest, status: "paused", remainingMs: 7 * MIN };

    const { result, onEvent } = setup({ initialState: savedPaused });

    expect(result.current.state.status).toBe("paused");
    expect(result.current.remainingMs).toBe(7 * MIN);
    expect(endEvents(onEvent)).toHaveLength(0);
  });
});
