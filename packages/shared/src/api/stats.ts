/**
 * The stats API: GET /api/stats?tz=America/Vancouver (signed-in only).
 *
 * Every number is calculated on the server, in SQL, from completed focus
 * sessions. The browser sends its time zone because "which day was this?"
 * depends on where you are: 06:30 UTC on Oct 21 is still Oct 20 in Vancouver.
 */
import { z } from "zod";

/** How many days the heatmap covers, ending today. */
export const STATS_HEATMAP_DAYS = 365;

/** True for a time zone name the runtime knows, like "Europe/Paris" or "UTC". */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    // Throws a RangeError for names it doesn't recognize.
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** An IANA time zone name, e.g. "America/Vancouver". */
export const TimeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: "Unknown time zone." });

export const StatsQuerySchema = z.object({ tz: TimeZoneSchema });
export type StatsQuery = z.infer<typeof StatsQuerySchema>;

/** A calendar date in the user's time zone, "2026-10-21". */
const LocalDateSchema = z.iso.date();
const count = z.number().int().nonnegative();

export const StatsSchema = z.object({
  /** The time zone these numbers were calculated in. */
  timeZone: z.string(),
  /** Today's date in that time zone (the heatmap's last day). */
  today: LocalDateSchema,
  totals: z.object({
    focusMinutes: count,
    completedSessions: count,
    abandonedSessions: count,
  }),
  /** Days in a row with at least one completed session. */
  streak: z.object({
    /** Includes today, or yesterday if there's nothing yet today. */
    current: count,
    longest: count,
  }),
  /** Days with focus in the last STATS_HEATMAP_DAYS days, oldest first (days without focus are left out). */
  days: z.array(z.object({ date: LocalDateSchema, focusMinutes: count, sessions: count })),
  /** Focus minutes by the hour of day sessions started, 0 (midnight) to 23. */
  byHour: z.array(count).length(24),
  /** Minutes per tag, most first. `tag: null` is untagged focus. */
  byTag: z.array(z.object({ tag: z.string().nullable(), focusMinutes: count, sessions: count })),
});
export type Stats = z.infer<typeof StatsSchema>;

export const StatsResponseSchema = z.object({ stats: StatsSchema });
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
