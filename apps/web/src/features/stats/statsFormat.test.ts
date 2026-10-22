// Tests for the stats page's pure helpers.
import { describe, expect, it } from "vitest";
import {
  addDays,
  buildHeatmap,
  focusLevel,
  formatDate,
  formatHour,
  formatMinutes,
} from "./statsFormat";

describe("addDays", () => {
  it("moves across months and years", () => {
    expect(addDays("2026-10-21", -21)).toBe("2026-09-30");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });

  // A fixed calendar date, whatever the browser's own time zone does.
  it("isn't thrown off by daylight saving", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("focusLevel", () => {
  it.each([
    [0, 0],
    [15, 1],
    [25, 1],
    [26, 2],
    [50, 2],
    [100, 3],
    [101, 4],
  ] as const)("shades %i minutes as level %i", (minutes, level) => {
    expect(focusLevel(minutes)).toBe(level);
  });
});

describe("buildHeatmap", () => {
  // Wednesday, Oct 21, 2026.
  const today = "2026-10-21";

  it("ends on today, in its weekday row, with later days left empty", () => {
    const { weeks } = buildHeatmap([], today);

    const last = weeks.at(-1)!;
    expect(last.map((day) => day?.date ?? null)).toEqual([
      "2026-10-18", // Sunday
      "2026-10-19",
      "2026-10-20",
      "2026-10-21", // Wednesday: today
      null,
      null,
      null,
    ]);
  });

  it("covers exactly the last 365 days", () => {
    const { weeks } = buildHeatmap([], today);

    const shown = weeks.flat().filter((day) => day !== null);
    expect(shown).toHaveLength(365);
    expect(shown[0]?.date).toBe("2025-10-22");
    expect(weeks).toHaveLength(53);
  });

  it("fills in each day's minutes and shade, and counts active days in the window", () => {
    const { weeks, activeDays } = buildHeatmap(
      [
        { date: "2024-01-01", focusMinutes: 25, sessions: 1 }, // outside the window
        { date: "2026-10-20", focusMinutes: 75, sessions: 3 },
      ],
      today,
    );

    const tuesday = weeks.at(-1)![2];
    expect(tuesday).toEqual({ date: "2026-10-20", focusMinutes: 75, sessions: 3, level: 3 });
    expect(activeDays).toBe(1);
  });

  it("labels the column where each month starts", () => {
    const { months } = buildHeatmap([], today, { locale: "en-US" });

    expect(months.at(-1)).toEqual({ label: "Oct", week: 49 });
    expect(months.map((m) => m.label)).toEqual([
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
    ]);
  });
});

describe("formatting", () => {
  it.each([
    [45, "45 min"],
    [60, "1 h"],
    [125, "2 h 5 min"],
  ])("formats %i minutes as %s", (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text);
  });

  it("writes hours and dates in the user's locale", () => {
    expect(formatHour(0, "en-US")).toBe("12 AM");
    expect(formatHour(15, "en-US")).toBe("3 PM");
    expect(formatDate("2026-10-21", "en-US")).toBe("Wed, Oct 21, 2026");
  });
});
