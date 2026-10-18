/**
 * The focus timer's rules, as a pure state machine.
 *
 * `transition(state, action, settings)` takes the current state and something
 * that happened (an action) and returns the next state, plus a list of
 * events for the outside world to react to (save a session, play a sound...).
 *
 * Nothing in this file reads the clock, touches the DOM, or saves anything.
 * Time arrives as `now` inside each action. That keeps every rule here
 * testable with plain function calls, no fake timers needed.
 *
 * Time is tracked with an `endsAt` timestamp, never by counting ticks:
 * remaining time is always `endsAt - now` (see CLAUDE.md, "Timer accuracy").
 */
import { metersEarned, type FocusSession, type TimerSettings } from "@summit/shared";

/** Which kind of period the timer is on. */
export type TimerMode = "focus" | "shortBreak" | "longBreak";

/** Fields every state has. */
interface BaseState {
  mode: TimerMode;
  /** Focus sessions completed since the app opened; drives the long-break rhythm. */
  completedFocusCount: number;
}

/** Fields of a period that has been started (running or paused). */
interface ActiveFields {
  /** Id for the FocusSession this period will be saved as (unused for breaks). */
  sessionId: string;
  /** When the period was first started (ms since epoch). Pausing doesn't change it. */
  startedAt: number;
  /** Planned length, fixed at start so changing settings mid-session can't affect it. */
  durationMs: number;
}

/** Ready to start `mode`, waiting for the user. */
export interface IdleState extends BaseState {
  status: "idle";
}

/** Counting down. */
export interface RunningState extends BaseState, ActiveFields {
  status: "running";
  /** The moment this period ends (ms since epoch). The single source of truth for time. */
  endsAt: number;
}

/** Frozen with time left. Resuming sets a fresh `endsAt = now + remainingMs`. */
export interface PausedState extends BaseState, ActiveFields {
  status: "paused";
  remainingMs: number;
}

/**
 * A "discriminated union": `status` tells TypeScript which shape we have, so
 * after `if (state.status === "running")` it knows `state.endsAt` exists.
 */
export type TimerState = IdleState | RunningState | PausedState;

/** Things that can happen to the timer. Each carries the current time. */
export type TimerAction =
  | { type: "START"; now: number; sessionId: string }
  | { type: "PAUSE"; now: number }
  | { type: "RESUME"; now: number }
  /** "Check the clock": completes the period if its time is up. */
  | { type: "TICK"; now: number }
  /** Abandon the current focus session (the UI confirms first). */
  | { type: "GIVE_UP"; now: number }
  | { type: "SKIP_BREAK"; now: number };

/** Things the outside world should react to after a transition. */
export type TimerEvent =
  | { type: "focusCompleted"; session: FocusSession }
  | { type: "focusAbandoned"; session: FocusSession }
  | { type: "breakCompleted"; mode: "shortBreak" | "longBreak" };

export interface TransitionResult {
  state: TimerState;
  events: TimerEvent[];
}

/** Where every new timer starts: ready to focus. */
export const INITIAL_TIMER_STATE: TimerState = {
  status: "idle",
  mode: "focus",
  completedFocusCount: 0,
};

const MS_PER_MINUTE = 60_000;

/** How long a period of `mode` lasts with the given settings, in ms. */
export function durationMsFor(mode: TimerMode, settings: TimerSettings): number {
  const minutes = {
    focus: settings.focusMinutes,
    shortBreak: settings.shortBreakMinutes,
    longBreak: settings.longBreakMinutes,
  }[mode];
  return minutes * MS_PER_MINUTE;
}

/**
 * The state machine. Returns the *same* state object when an action doesn't
 * apply (e.g. PAUSE while idle), which lets React skip re-rendering.
 */
export function transition(
  state: TimerState,
  action: TimerAction,
  settings: TimerSettings,
): TransitionResult {
  const unchanged: TransitionResult = { state, events: [] };

  switch (action.type) {
    case "START": {
      if (state.status !== "idle") return unchanged;
      const durationMs = durationMsFor(state.mode, settings);
      return {
        state: {
          status: "running",
          mode: state.mode,
          completedFocusCount: state.completedFocusCount,
          sessionId: action.sessionId,
          startedAt: action.now,
          durationMs,
          endsAt: action.now + durationMs,
        },
        events: [],
      };
    }

    case "PAUSE": {
      if (state.status !== "running") return unchanged;
      // Time already ran out (e.g. the tab was asleep): it's finished, not paused.
      if (action.now >= state.endsAt) return complete(state, settings);
      const { endsAt, ...rest } = state;
      return {
        state: { ...rest, status: "paused", remainingMs: endsAt - action.now },
        events: [],
      };
    }

    case "RESUME": {
      if (state.status !== "paused") return unchanged;
      const { remainingMs, ...rest } = state;
      return {
        state: { ...rest, status: "running", endsAt: action.now + remainingMs },
        events: [],
      };
    }

    case "TICK": {
      if (state.status === "running" && action.now >= state.endsAt) {
        return complete(state, settings);
      }
      return unchanged;
    }

    case "GIVE_UP": {
      if (state.mode !== "focus" || state.status === "idle") return unchanged;
      // You can't give up a session whose time is already up: it counts.
      if (state.status === "running" && action.now >= state.endsAt) {
        return complete(state, settings);
      }
      return {
        state: { status: "idle", mode: "focus", completedFocusCount: state.completedFocusCount },
        events: [{ type: "focusAbandoned", session: buildSession(state, "ABANDONED", action.now) }],
      };
    }

    case "SKIP_BREAK": {
      if (state.mode === "focus") return unchanged;
      // Breaks aren't recorded, so skipping one just moves on to focus.
      return {
        state: { status: "idle", mode: "focus", completedFocusCount: state.completedFocusCount },
        events: [],
      };
    }
  }
}

/** Finishes a running period whose time is up and picks what comes next. */
function complete(state: RunningState, settings: TimerSettings): TransitionResult {
  if (state.mode === "focus") {
    const completedFocusCount = state.completedFocusCount + 1;
    // Every Nth completed focus session earns the long break instead of the short one.
    const nextMode =
      completedFocusCount % settings.longBreakEvery === 0 ? "longBreak" : "shortBreak";
    return {
      state: { status: "idle", mode: nextMode, completedFocusCount },
      // endedAt is when time actually ran out (endsAt), not when we noticed.
      // If the tab slept for an hour, the session still ended on schedule.
      events: [{ type: "focusCompleted", session: buildSession(state, "COMPLETED", state.endsAt) }],
    };
  }

  return {
    state: { status: "idle", mode: "focus", completedFocusCount: state.completedFocusCount },
    events: [{ type: "breakCompleted", mode: state.mode }],
  };
}

/** Turns a finished focus period into the FocusSession record we save. */
function buildSession(
  state: RunningState | PausedState,
  status: "COMPLETED" | "ABANDONED",
  endedAtMs: number,
): FocusSession {
  const plannedMinutes = Math.round(state.durationMs / MS_PER_MINUTE);
  return {
    id: state.sessionId,
    plannedMinutes,
    startedAt: new Date(state.startedAt).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    status,
    tag: null,
    metersGained: metersEarned(status, plannedMinutes),
    roomId: null,
  };
}
