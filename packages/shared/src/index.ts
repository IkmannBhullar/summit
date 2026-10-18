// Public entry point for @summit/shared.
// Apps import from "@summit/shared" and get only what's re-exported here,
// so internal file layout can change without breaking imports.
export { METERS_PER_FOCUS_MINUTE, metersForFocusMinutes } from "./elevation";
export { findPeak, PEAKS, type Peak } from "./peaks";
export {
  applyMeters,
  ClimbProgressSchema,
  ClimbSchema,
  createInitialProgress,
  getCurrentClimb,
  type ApplyMetersResult,
  type Climb,
  type ClimbProgress,
  type CurrentClimb,
} from "./climb";
export {
  FocusSessionSchema,
  metersEarned,
  SessionStatusSchema,
  type FocusSession,
  type SessionStatus,
} from "./session";
export {
  DEFAULT_TIMER_SETTINGS,
  TIMER_SETTING_LIMITS,
  TimerSettingsSchema,
  type TimerSettings,
} from "./settings";
