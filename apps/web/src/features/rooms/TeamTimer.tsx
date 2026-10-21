import type { RoomState } from "@summit/shared";
import { useState, type FormEvent } from "react";
import { PrimaryButton, SecondaryButton } from "../../components/Buttons";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { formatClock } from "../timer/formatClock";
import type { RoomClock } from "./roomClock";
import type { RoomResult } from "./roomConnection";

/** Focus lengths the host can pick (plus their own default, if it's not here). */
const MINUTE_CHOICES = [15, 20, 25, 30, 45, 50, 60];

export interface TeamTimerProps {
  clock: RoomClock;
  isHost: boolean;
  hostName: string;
  /** Am I one of the climbers in the running session? (Late joiners just watch.) */
  inSession: boolean;
  /** Preselected focus length: the host's own timer setting. */
  defaultMinutes: number;
  onStart: (plannedMinutes: number) => Promise<RoomResult<RoomState>>;
  onGiveUp: () => Promise<RoomResult<RoomState>>;
}

/** The shared timer: start controls, the "3, 2, 1", the focus clock, and the break. */
export function TeamTimer(props: TeamTimerProps) {
  const { clock } = props;

  return (
    <section
      aria-label="Team timer"
      className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl bg-white px-6 py-8 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
    >
      {clock.kind === "countdown" && (
        <>
          <p className="text-lg font-medium text-slate-600 dark:text-slate-400">Starting in</p>
          {/* Whole seconds, rounded up: 3, 2, 1. */}
          <p role="timer" className="text-8xl font-bold tabular-nums">
            {Math.ceil(clock.msLeft / 1000)}
          </p>
        </>
      )}
      {clock.kind === "focus" && <FocusClock {...props} clock={clock} />}
      {clock.kind === "break" && (
        <>
          <p className="text-lg font-medium text-sky-700 dark:text-sky-300">Team break</p>
          <p role="timer" className="text-7xl font-bold tabular-nums sm:text-8xl">
            {formatClock(clock.msLeft)}
          </p>
        </>
      )}
      {(clock.kind === "idle" || clock.kind === "break") && <StartControls {...props} />}
    </section>
  );
}

function FocusClock({
  clock,
  inSession,
  onGiveUp,
}: TeamTimerProps & { clock: Extract<RoomClock, { kind: "focus" }> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  const giveUp = async () => {
    setConfirming(false);
    const result = await onGiveUp();
    if (!result.ok) setError(result.error.message);
  };

  return (
    <>
      <p className="text-lg font-medium text-teal-700 dark:text-teal-400">Team focus</p>
      <p role="timer" className="text-7xl font-bold tabular-nums sm:text-8xl">
        {formatClock(clock.msLeft)}
      </p>
      <div
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clock.fractionDone * 100)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className="h-full bg-teal-600 dark:bg-teal-500"
          style={{ width: `${clock.fractionDone * 100}%` }}
        />
      </div>
      {inSession ? (
        <SecondaryButton onClick={() => setConfirming(true)}>Give up</SecondaryButton>
      ) : (
        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          You joined mid-session, so you&apos;re watching this one. You&apos;ll be roped in for the
          next.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title="Give up for the whole team?"
        confirmLabel="Give up"
        cancelLabel="Keep climbing"
        onConfirm={() => void giveUp()}
        onCancel={() => setConfirming(false)}
      >
        The rope team slips back down: nobody gets this session&apos;s meters.
      </ConfirmDialog>
    </>
  );
}

function StartControls({ clock, isHost, hostName, defaultMinutes, onStart }: TeamTimerProps) {
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const choices = [...new Set([...MINUTE_CHOICES, defaultMinutes])].sort((a, b) => a - b);

  if (!isHost) {
    return (
      <p className="text-center text-slate-600 dark:text-slate-400">
        Waiting for {hostName} to start {clock.kind === "break" ? "the next" : "a"} session.
      </p>
    );
  }

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setStarting(true);
    setError(undefined);
    const result = await onStart(minutes);
    setStarting(false);
    if (!result.ok) setError(result.error.message);
  };

  return (
    <form onSubmit={(event) => void start(event)} className="flex w-full flex-col gap-3">
      <label className="flex items-center justify-between gap-3 font-medium">
        Focus length
        <select
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-300 dark:bg-slate-950 dark:ring-slate-700"
        >
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice} min
            </option>
          ))}
        </select>
      </label>
      <PrimaryButton type="submit" disabled={starting}>
        {clock.kind === "break" ? "Start next session" : "Start team session"}
      </PrimaryButton>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
