import type { TimerMode } from "./timerMachine";

/**
 * Human-readable names for each timer mode.
 *
 * Lives in its own file (not TimerScreen.tsx) because Vite's Fast Refresh
 * can only hot-swap files that export React components and nothing else.
 */
export const MODE_LABELS: Record<TimerMode, string> = {
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};
