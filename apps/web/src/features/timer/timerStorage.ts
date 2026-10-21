/**
 * Saving and restoring the timer's state, so a page reload (or a closed
 * laptop) doesn't lose a session in progress.
 *
 * Only the timer's facts are saved (mode, endsAt...). Because time is
 * tracked with timestamps, restoring is enough: if the session ended while
 * the page was closed, the next TICK completes it at its real end time.
 */
import { TagSchema, TIMER_SETTING_LIMITS } from "@summit/shared";
import { z } from "zod";
import { loadFromStorage, saveToStorage } from "../../lib/storage";
import { INITIAL_TIMER_STATE, type TimerState } from "./timerMachine";

const STORAGE_KEY = "timer";

/** The longest any single period can be: the maximum focus length. */
const MAX_DURATION_MS = TIMER_SETTING_LIMITS.focusMinutes.max * 60_000;

const timestamp = z.number().int().nonnegative();

const baseFields = {
  mode: z.enum(["focus", "shortBreak", "longBreak"]),
  completedFocusCount: z.number().int().nonnegative(),
};

const activeFields = {
  sessionId: z.uuid(),
  startedAt: timestamp,
  durationMs: z.number().int().positive().max(MAX_DURATION_MS),
  // .default(null): a timer saved before tags existed still loads.
  tag: TagSchema.nullable().default(null),
};

/**
 * Validates a saved TimerState. `discriminatedUnion` picks the right shape
 * by looking at `status` first, which gives clearer errors than trying each one.
 */
export const TimerStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle"), ...baseFields }),
  z
    .object({ status: z.literal("running"), ...baseFields, ...activeFields, endsAt: timestamp })
    // Pausing can only push endsAt later, never earlier. An earlier endsAt
    // means edited data trying to finish a session (and earn meters) early.
    .refine((state) => state.endsAt >= state.startedAt + state.durationMs, {
      message: "endsAt is earlier than the session allows",
    }),
  z
    .object({
      status: z.literal("paused"),
      ...baseFields,
      ...activeFields,
      remainingMs: z.number().int().nonnegative(),
    })
    .refine((state) => state.remainingMs <= state.durationMs, {
      message: "remainingMs is longer than the session",
    }),
]);

/** Loads the saved timer, or a fresh idle timer if nothing valid is saved. */
export function loadTimerState(): TimerState {
  return loadFromStorage<TimerState>(STORAGE_KEY, TimerStateSchema, INITIAL_TIMER_STATE);
}

/** Saves the timer's current state. */
export function saveTimerState(state: TimerState): void {
  saveToStorage(STORAGE_KEY, state);
}
