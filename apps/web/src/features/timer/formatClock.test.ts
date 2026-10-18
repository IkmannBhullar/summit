// Tests for the countdown clock formatter.
import { describe, expect, it } from "vitest";
import { formatClock } from "./formatClock";

describe("formatClock", () => {
  it.each([
    [25 * 60_000, "25:00"],
    [5 * 60_000 + 5_000, "5:05"],
    [60_000, "1:00"],
    [59_000, "0:59"],
    [0, "0:00"],
    [120 * 60_000, "120:00"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatClock(ms)).toBe(expected);
  });

  // Round up: a countdown shows "0:01" until the very last moment.
  it.each([
    [1, "0:01"],
    [999, "0:01"],
    [1_001, "0:02"],
    [25 * 60_000 - 1, "25:00"],
  ])("rounds %d ms up to %s", (ms, expected) => {
    expect(formatClock(ms)).toBe(expected);
  });

  it("never shows negative time", () => {
    expect(formatClock(-5_000)).toBe("0:00");
  });
});
