/**
 * Timer settings: how long focus and break periods last, and how often the
 * long break comes around. Shared so the settings form, saved data, and (in
 * Phase 2) the API all validate against the same limits.
 */
import { z } from "zod";

/**
 * Allowed range for each setting, in minutes (or sessions, for
 * `longBreakEvery`). The settings form uses these for its input min/max, so
 * the UI and validation can't drift apart.
 */
export const TIMER_SETTING_LIMITS = {
  focusMinutes: { min: 1, max: 120 },
  shortBreakMinutes: { min: 1, max: 30 },
  longBreakMinutes: { min: 1, max: 60 },
  longBreakEvery: { min: 2, max: 10 },
} as const;

/** Builds a whole-number field limited to one of the ranges above. */
const limitedInt = ({ min, max }: { min: number; max: number }) =>
  z.number().int().min(min).max(max);

export const TimerSettingsSchema = z.object({
  /** Length of a focus session. */
  focusMinutes: limitedInt(TIMER_SETTING_LIMITS.focusMinutes),
  /** Length of a regular break. */
  shortBreakMinutes: limitedInt(TIMER_SETTING_LIMITS.shortBreakMinutes),
  /** Length of the longer break. */
  longBreakMinutes: limitedInt(TIMER_SETTING_LIMITS.longBreakMinutes),
  /** A long break replaces the short one after every Nth completed focus session. */
  longBreakEvery: limitedInt(TIMER_SETTING_LIMITS.longBreakEvery),
});
export type TimerSettings = z.infer<typeof TimerSettingsSchema>;

/** The classic Pomodoro rhythm: 25 min focus, 5 min break, 15 min every 4th break. */
export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
};
