// Tests for timer settings validation.
import { describe, expect, it } from "vitest";
import { DEFAULT_TIMER_SETTINGS, TIMER_SETTING_LIMITS, TimerSettingsSchema } from "./settings";

describe("TimerSettingsSchema", () => {
  it("accepts the defaults (25 / 5 / 15, long break every 4)", () => {
    expect(TimerSettingsSchema.parse(DEFAULT_TIMER_SETTINGS)).toEqual({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
    });
  });

  it("accepts the exact edges of every range", () => {
    const allMins = Object.fromEntries(
      Object.entries(TIMER_SETTING_LIMITS).map(([key, range]) => [key, range.min]),
    );
    const allMaxes = Object.fromEntries(
      Object.entries(TIMER_SETTING_LIMITS).map(([key, range]) => [key, range.max]),
    );

    expect(TimerSettingsSchema.safeParse(allMins).success).toBe(true);
    expect(TimerSettingsSchema.safeParse(allMaxes).success).toBe(true);
  });

  it.each([
    ["focus of 0 minutes", { focusMinutes: 0 }],
    ["focus above the max", { focusMinutes: TIMER_SETTING_LIMITS.focusMinutes.max + 1 }],
    ["fractional minutes", { shortBreakMinutes: 2.5 }],
    ["a long break every 1 session", { longBreakEvery: 1 }],
    ["a number sent as text", { focusMinutes: "25" }],
  ])("rejects %s", (_label, override) => {
    const result = TimerSettingsSchema.safeParse({ ...DEFAULT_TIMER_SETTINGS, ...override });

    expect(result.success).toBe(false);
  });

  it("rejects settings with a field missing", () => {
    const { longBreakEvery: _omitted, ...missingOne } = DEFAULT_TIMER_SETTINGS;

    expect(TimerSettingsSchema.safeParse(missingOne).success).toBe(false);
  });
});
