import { DEFAULT_TIMER_SETTINGS, type TimerSettings } from "@summit/shared";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { formatClock } from "./formatClock";
import { MODE_LABELS } from "./modeLabels";
import type { TimerEvent } from "./timerMachine";
import { loadTimerState, saveTimerState } from "./timerStorage";
import { useFocusTimer } from "./useFocusTimer";

export interface TimerScreenProps {
  settings?: TimerSettings;
  /** Lets the parent react to timer events too (e.g. saving history). */
  onEvent?: (event: TimerEvent) => void;
  /** Focus sessions completed today, shown under the clock. */
  completedToday?: number;
}

/** The main timer: countdown, controls, and the give-up confirmation. */
export function TimerScreen({
  settings = DEFAULT_TIMER_SETTINGS,
  onEvent,
  completedToday = 0,
}: TimerScreenProps) {
  // A short message about what just happened, announced to screen readers.
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);

  // Turn timer events into a friendly message, then pass them on.
  const handleEvent = useCallback(
    (event: TimerEvent) => {
      if (event.type === "focusCompleted") {
        setMessage(`Session complete: +${event.session.metersGained} m`);
      } else if (event.type === "focusAbandoned") {
        setMessage("You slid back down. That session's elevation didn't count.");
      } else {
        setMessage("Break's over. Ready to climb?");
      }
      onEvent?.(event);
    },
    [onEvent],
  );

  // Restore a session in progress from before a reload (read once, on mount).
  const [restoredState] = useState(loadTimerState);
  const timer = useFocusTimer({ settings, onEvent: handleEvent, initialState: restoredState });
  const { state, remainingMs, durationMs } = timer;

  // Save the timer whenever its state changes, so a reload can pick it up.
  // Only real transitions change `state`; the countdown ticking doesn't.
  useEffect(() => {
    saveTimerState(state);
  }, [state]);
  const clock = formatClock(remainingMs);
  const isFocus = state.mode === "focus";
  const isActive = state.status !== "idle";

  // Show the countdown in the browser tab title, so it's visible from other tabs.
  useEffect(() => {
    document.title = isActive ? `${clock} · ${MODE_LABELS[state.mode]} · Summit` : "Summit";
  }, [clock, isActive, state.mode]);

  // Reset the title when the timer screen goes away (the effect's cleanup).
  useEffect(() => {
    return () => {
      document.title = "Summit";
    };
  }, []);

  // Starting a new period clears the old message.
  const start = () => {
    setMessage(null);
    timer.start();
  };

  const confirmGiveUp = () => {
    setConfirmingGiveUp(false);
    timer.giveUp();
  };

  // How far through the current period we are (0 to 1), for the progress bar.
  const progress = durationMs > 0 ? 1 - remainingMs / durationMs : 0;
  // Dots for the long-break rhythm: how many focus sessions into this cycle.
  const cycleLength = settings.longBreakEvery;
  const dotsFilled =
    state.mode === "longBreak" ? cycleLength : state.completedFocusCount % cycleLength;

  return (
    <section
      aria-labelledby="timer-mode"
      className="flex w-full max-w-sm flex-col items-center gap-6"
    >
      <h2
        id="timer-mode"
        className={`text-sm font-semibold tracking-widest uppercase ${
          isFocus ? "text-teal-700 dark:text-teal-400" : "text-sky-700 dark:text-sky-400"
        }`}
      >
        {MODE_LABELS[state.mode]}
        {state.status === "paused" && " · Paused"}
      </h2>

      {/* role="timer" tells assistive tech this is a clock. Its contents change
          every second, so it is deliberately NOT a live region (that would
          announce every tick). */}
      <p
        role="timer"
        aria-label={`${clock} remaining`}
        className="text-7xl font-bold tabular-nums sm:text-8xl"
      >
        {clock}
      </p>

      {/* Visual progress only; the clock above already gives the same information. */}
      <div
        aria-hidden="true"
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className={`h-full rounded-full ${isFocus ? "bg-teal-600" : "bg-sky-500"}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: cycleLength }, (_, i) => (
            <span
              key={i}
              className={`size-2 rounded-full ${i < dotsFilled ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"}`}
            />
          ))}
        </span>
        {completedToday} {completedToday === 1 ? "session" : "sessions"} today
      </p>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        {state.status === "idle" && (
          <PrimaryButton onClick={start}>{isFocus ? "Start focus" : "Start break"}</PrimaryButton>
        )}
        {state.status === "running" && <PrimaryButton onClick={timer.pause}>Pause</PrimaryButton>}
        {state.status === "paused" && <PrimaryButton onClick={timer.resume}>Resume</PrimaryButton>}

        {isFocus && isActive && (
          <SecondaryButton onClick={() => setConfirmingGiveUp(true)}>Give up</SecondaryButton>
        )}
        {!isFocus && <SecondaryButton onClick={timer.skipBreak}>Skip break</SecondaryButton>}
      </div>

      {/* A polite live region: screen readers announce new messages when idle. */}
      <p aria-live="polite" className="min-h-6 text-center font-medium">
        {message}
      </p>

      <ConfirmDialog
        open={confirmingGiveUp}
        title="Give up this session?"
        confirmLabel="Give up"
        cancelLabel="Keep climbing"
        onConfirm={confirmGiveUp}
        onCancel={() => setConfirmingGiveUp(false)}
      >
        You&apos;ll slide back down: this session&apos;s elevation won&apos;t count.
      </ConfirmDialog>
    </section>
  );
}

/** The main call-to-action button. */
function PrimaryButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-teal-700 px-8 py-3 text-lg font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
    >
      {children}
    </button>
  );
}

/** A quieter, outlined button for secondary actions. */
function SecondaryButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-8 py-3 text-lg font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
