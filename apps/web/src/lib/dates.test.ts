// Tests for the date helpers. Tests run with TZ=UTC (see vite.config.ts),
// so "local" time here is UTC.
import { describe, expect, it } from "vitest";
import { dayLabel, localDateKey, timeLabel } from "./dates";

const NOW = new Date("2026-10-17T15:00:00.000Z"); // a Saturday afternoon

describe("localDateKey", () => {
  it("formats the local calendar day as YYYY-MM-DD", () => {
    expect(localDateKey(new Date("2026-03-05T23:59:59.000Z"))).toBe("2026-03-05");
  });

  it("confirms tests really run in UTC", () => {
    expect(process.env.TZ).toBe("UTC");
    expect(new Date("2026-10-17T00:30:00.000Z").getHours()).toBe(0);
  });
});

describe("dayLabel", () => {
  it.each([
    ["2026-10-17T00:00:00.000Z", "Today"],
    ["2026-10-17T23:59:00.000Z", "Today"],
    ["2026-10-16T08:00:00.000Z", "Yesterday"],
    ["2026-10-15T08:00:00.000Z", "Thu, Oct 15"],
  ])("labels %s as %s", (iso, expected) => {
    expect(dayLabel(new Date(iso), NOW, "en-US")).toBe(expected);
  });

  it("finds 'Yesterday' across a month and year boundary", () => {
    const newYearsDay = new Date("2027-01-01T10:00:00.000Z");

    expect(dayLabel(new Date("2026-12-31T22:00:00.000Z"), newYearsDay, "en-US")).toBe("Yesterday");
  });
});

describe("timeLabel", () => {
  it("formats a time of day for the given locale", () => {
    expect(timeLabel(new Date("2026-10-17T09:05:00.000Z"), "en-US")).toBe("9:05 AM");
  });
});
