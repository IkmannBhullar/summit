// Public entry point for @summit/shared.
// Apps import from "@summit/shared" and get only what's re-exported here,
// so internal file layout can change without breaking imports.
export { METERS_PER_FOCUS_MINUTE, metersForFocusMinutes } from "./elevation";
