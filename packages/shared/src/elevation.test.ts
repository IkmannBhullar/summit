// Unit tests for the elevation rules.
// We import describe/it/expect explicitly (instead of Vitest "globals") so it's
// obvious where they come from and TypeScript knows their types.
import { describe, expect, it } from "vitest";
import { METERS_PER_FOCUS_MINUTE, metersForFocusMinutes } from "./elevation";

describe("metersForFocusMinutes", () => {
  // The headline rule from CLAUDE.md: a 25-minute session = 250 m.
  it("gives 250 m for a standard 25-minute session", () => {
    expect(metersForFocusMinutes(25)).toBe(250);
  });

  // Also checks the formula uses the constant, not a hard-coded 10.
  it("scales with METERS_PER_FOCUS_MINUTE", () => {
    expect(metersForFocusMinutes(3)).toBe(3 * METERS_PER_FOCUS_MINUTE);
  });

  it("gives 0 m for 0 minutes", () => {
    expect(metersForFocusMinutes(0)).toBe(0);
  });

  // Partial minutes don't count: only *completed* minutes earn elevation.
  it("ignores a partial final minute", () => {
    expect(metersForFocusMinutes(24.9)).toBe(240);
  });

  // Bad input should fail loudly rather than corrupt someone's progress.
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("throws RangeError for %s", (bad) => {
    expect(() => metersForFocusMinutes(bad)).toThrow(RangeError);
  });
});
