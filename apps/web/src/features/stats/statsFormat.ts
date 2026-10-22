/**
 * Pure helpers for the stats page: the heatmap's grid and shading, and
 * friendly time labels. No React and no clock, so they're easy to test.
 *
 * Dates here are calendar dates in the user's time zone ("2026-10-21"), as
 * the server sends them. To do arithmetic on them safely, they're treated
 * as UTC midnights, so the browser's own time zone can't shift them.
 */
import type { Stats } from "@summit/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Adds whole days to a calendar date: addDays("2026-10-21", -1) → "2026-10-20". */
export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/**
 * How dark a heatmap square is, 0 (none) to 4, by minutes of focus that day.
 * The steps are about one, two, four, and more 25-minute sessions.
 */
export function focusLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes <= 25) return 1;
  if (minutes <= 50) return 2;
  if (minutes <= 100) return 3;
  return 4;
}

export interface HeatmapDay {
  date: string;
  focusMinutes: number;
  sessions: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface Heatmap {
  /** Columns of 7 (Sunday first). null marks a day outside the window. */
  weeks: (HeatmapDay | null)[][];
  /** Month labels: the column where each month's 1st falls. */
  months: { label: string; week: number }[];
  /** Days in the window with any focus. */
  activeDays: number;
}

/**
 * Lays out the last `totalDays` days (ending `today`) as week columns, the
 * way GitHub's contribution graph does: each column is Sunday to Saturday,
 * so the first and last columns may be partly empty.
 */
export function buildHeatmap(
  days: Stats["days"],
  today: string,
  { totalDays = 365, locale }: { totalDays?: number; locale?: string } = {},
): Heatmap {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const first = addDays(today, -(totalDays - 1));
  // Back up to the Sunday on or before the first day (getUTCDay: 0 = Sunday).
  const gridStart = addDays(first, -new Date(toUtc(first)).getUTCDay());
  const monthName = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });

  const weeks: (HeatmapDay | null)[][] = [];
  const months: Heatmap["months"] = [];
  for (let date = gridStart; date <= today; date = addDays(date, 7)) {
    const week: (HeatmapDay | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(date, i);
      if (day < first || day > today) {
        week.push(null);
        continue;
      }
      const data = byDate.get(day);
      const focusMinutes = data?.focusMinutes ?? 0;
      week.push({
        date: day,
        focusMinutes,
        sessions: data?.sessions ?? 0,
        level: focusLevel(focusMinutes),
      });
      if (day.endsWith("-01"))
        months.push({ label: monthName.format(toUtc(day)), week: weeks.length });
    }
    weeks.push(week);
  }

  const activeDays = days.filter((day) => day.date >= first && day.date <= today).length;
  return { weeks, months, activeDays };
}

/** 45 → "45 min", 60 → "1 h", 125 → "2 h 5 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** An hour of the day as the user's locale writes it: 0 → "12 AM" (en-US), "00" (en-GB). */
export function formatHour(hour: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(
    Date.UTC(2026, 0, 1, hour),
  );
}

/** "2026-10-21" → "Wed, Oct 21, 2026" in the user's locale. */
export function formatDate(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtc(date));
}
