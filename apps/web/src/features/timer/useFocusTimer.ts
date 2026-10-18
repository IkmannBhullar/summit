/**
 * useFocusTimer: connects the pure timer state machine to React and the real clock.
 *
 * The machine (timerMachine.ts) decides *what* happens. This hook decides
 * *when* to ask it:
 * - when the user clicks (start, pause, resume, give up, skip break)
 * - on a short interval while running, to refresh the countdown and notice
 *   the end. The interval only triggers a re-check; it never counts time.
 * - the moment the tab becomes visible again. Background tabs get their
 *   timers throttled, so the interval may have been asleep.
 */
import type { TimerSettings } from "@summit/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  durationMsFor,
  INITIAL_TIMER_STATE,
  transition,
  type TimerAction,
  type TimerEvent,
  type TimerState,
} from "./timerMachine";

/** How often to refresh the countdown while running. Only affects display smoothness. */
export const TICK_INTERVAL_MS = 250;

export interface UseFocusTimerOptions {
  /** Current settings. Changes apply to the *next* period, never the running one. */
  settings: TimerSettings;
  /** Called once per event (session completed/abandoned, break completed). */
  onEvent?: (event: TimerEvent) => void;
  /** Creates ids for new sessions. Tests can inject a predictable one. */
  createId?: () => string;
  /**
   * State to start from, e.g. one restored after a page reload. Only read on
   * the first render. If it's a running period whose time is already up, it
   * completes immediately (at its scheduled end time).
   */
  initialState?: TimerState;
}

export interface FocusTimer {
  state: TimerState;
  /** Milliseconds left in the current period (the full length when idle). */
  remainingMs: number;
  /** Total length of the current period, for progress bars. */
  durationMs: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  giveUp: () => void;
  skipBreak: () => void;
}

const defaultCreateId = () => crypto.randomUUID();

export function useFocusTimer({
  settings,
  onEvent,
  createId = defaultCreateId,
  initialState = INITIAL_TIMER_STATE,
}: UseFocusTimerOptions): FocusTimer {
  const [state, setState] = useState<TimerState>(initialState);
  // The time of the latest check. Storing it in state (rather than calling
  // Date.now() while rendering) keeps rendering pure and lets each tick
  // trigger a re-render so the countdown moves.
  const [now, setNow] = useState(() => Date.now());

  // Refs hold values we need inside callbacks without re-creating them.
  // stateRef always has the latest state, even between a dispatch and the
  // re-render it causes (e.g. two clicks in the same frame).
  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  const onEventRef = useRef(onEvent);
  const createIdRef = useRef(createId);

  // Keep the "latest value" refs current after every render.
  // useLayoutEffect runs before the browser paints, so no click can sneak in
  // between a render and the refs catching up.
  useLayoutEffect(() => {
    settingsRef.current = settings;
    onEventRef.current = onEvent;
    createIdRef.current = createId;
  });

  /**
   * Runs one action through the machine, then fires its events.
   *
   * Why not React's useReducer? A reducer must be pure, and in development
   * React deliberately calls it twice (StrictMode) to catch impurities. Our
   * events have side effects (saving a session, playing a sound), so they
   * must run exactly once, outside React's rendering. Here they run once
   * per dispatch.
   */
  const dispatch = useCallback((action: TimerAction) => {
    const result = transition(stateRef.current, action, settingsRef.current);
    if (result.state !== stateRef.current) {
      stateRef.current = result.state;
      setState(result.state);
    }
    setNow(action.now);
    for (const event of result.events) {
      onEventRef.current?.(event);
    }
  }, []);

  // Check the clock once right away. For a restored session whose time ran
  // out while the page was closed, this completes it straight away.
  useEffect(() => {
    dispatch({ type: "TICK", now: Date.now() });
  }, [dispatch]);

  // While running, re-check the clock a few times per second.
  useEffect(() => {
    if (state.status !== "running") return;
    const id = setInterval(() => {
      dispatch({ type: "TICK", now: Date.now() });
    }, TICK_INTERVAL_MS);
    // Cleanup: stop the interval when we pause, finish, or unmount.
    return () => clearInterval(id);
  }, [state.status, dispatch]);

  // When the tab comes back into view, check immediately: the interval may
  // have been throttled or frozen while the tab was hidden.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        dispatch({ type: "TICK", now: Date.now() });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [dispatch]);

  // Derived values: computed from state + now on every render, never stored.
  const durationMs =
    state.status === "idle" ? durationMsFor(state.mode, settings) : state.durationMs;
  const remainingMs =
    state.status === "running"
      ? Math.max(0, state.endsAt - now)
      : state.status === "paused"
        ? state.remainingMs
        : durationMs;

  // Stable action functions (useCallback), so components receiving them
  // don't re-render needlessly.
  const start = useCallback(
    () => dispatch({ type: "START", now: Date.now(), sessionId: createIdRef.current() }),
    [dispatch],
  );
  const pause = useCallback(() => dispatch({ type: "PAUSE", now: Date.now() }), [dispatch]);
  const resume = useCallback(() => dispatch({ type: "RESUME", now: Date.now() }), [dispatch]);
  const giveUp = useCallback(() => dispatch({ type: "GIVE_UP", now: Date.now() }), [dispatch]);
  const skipBreak = useCallback(
    () => dispatch({ type: "SKIP_BREAK", now: Date.now() }),
    [dispatch],
  );

  return { state, remainingMs, durationMs, start, pause, resume, giveUp, skipBreak };
}
