/**
 * Focus stats, calculated by Postgres.
 *
 * Why SQL instead of loading every session into Node and looping? The
 * database already has the rows and an index on (user_id, started_at), and
 * GROUP BY, window functions, and time zone math are what it's built for.
 * Only a few small result rows come back, however long the history is.
 *
 * Rules:
 * - Only COMPLETED sessions count toward minutes, streaks, and charts.
 * - A session belongs to the local day and hour it STARTED.
 * - "Local" means the user's time zone, converted by Postgres with
 *   `started_at AT TIME ZONE 'America/Vancouver'`, which follows the real
 *   rules (daylight saving included), not a fixed offset.
 *
 * Every query uses Prisma's $queryRaw tagged template: each ${value} is sent
 * as a separate parameter, never pasted into the SQL text, so nothing a user
 * sends (like the time zone) can change what the query does.
 */
import { STATS_HEATMAP_DAYS, type Stats } from "@summit/shared";
import type { PrismaClient } from "../db/client";
import { HttpError } from "../lib/httpError";

export interface StatsService {
  /** Everything the stats page shows, in the user's time zone. */
  forUser: (userId: string, timeZone: string) => Promise<Stats>;
}

/**
 * @param now - The clock that decides what "today" is. Tests pass a fixed one.
 */
export function createStatsService(
  prisma: PrismaClient,
  now: () => Date = () => new Date(),
): StatsService {
  return {
    async forUser(userId, timeZone) {
      const at = now();
      try {
        // "Today" in the user's time zone, from OUR clock.
        const [todayRow] = await prisma.$queryRaw<{ today: string }[]>`
          SELECT to_char((${at}::timestamptz AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS today
        `;
        const today = todayRow!.today;

        const [totals, days, streak, byHourRows, byTag] = await Promise.all([
          queryTotals(prisma, userId),
          queryDays(prisma, userId, timeZone, at, today),
          queryStreak(prisma, userId, timeZone, today),
          queryByHour(prisma, userId, timeZone),
          queryByTag(prisma, userId),
        ]);

        // The query only returns hours that have focus; fill in the zeros.
        const byHour = Array.from({ length: 24 }, () => 0);
        for (const row of byHourRows) byHour[row.hour] = row.focusMinutes;

        return { timeZone, today, totals, streak, days, byHour, byTag };
      } catch (error) {
        // The API checks the zone first, but Node and Postgres each have their
        // own time zone list. If Postgres doesn't know one Node accepted,
        // say so plainly instead of failing with a 500.
        if (error instanceof Error && /time zone .* not recognized/i.test(error.message)) {
          throw new HttpError(400, "VALIDATION_ERROR", "Some fields need fixing.", {
            fields: { tz: "Unknown time zone." },
          });
        }
        throw error;
      }
    },
  };
}

/**
 * All-time totals in one pass. FILTER (WHERE ...) applies a condition to one
 * aggregate only, so a single scan counts both completed and abandoned.
 * (count and sum return bigint in Postgres; ::int turns them into JS numbers.)
 */
async function queryTotals(prisma: PrismaClient, userId: string) {
  const [row] = await prisma.$queryRaw<Stats["totals"][]>`
    SELECT
      coalesce(sum(planned_minutes) FILTER (WHERE status = 'COMPLETED'), 0)::int AS "focusMinutes",
      count(*) FILTER (WHERE status = 'COMPLETED')::int AS "completedSessions",
      count(*) FILTER (WHERE status = 'ABANDONED')::int AS "abandonedSessions"
    FROM focus_sessions
    WHERE user_id = ${userId}::uuid
  `;
  return row!;
}

/**
 * The heatmap: minutes and sessions per local day, for the last 365 days.
 *
 * The inner query converts each start time to a local date. The extra
 * "started_at >= now − 367 days" condition is in UTC on purpose: it lets
 * Postgres use the (user_id, started_at) index to skip old rows, and 367
 * days is wide enough that no time zone can push a wanted day outside it.
 * The outer WHERE then keeps the exact local date range.
 */
async function queryDays(
  prisma: PrismaClient,
  userId: string,
  timeZone: string,
  at: Date,
  today: string,
) {
  return prisma.$queryRaw<Stats["days"]>`
    SELECT
      to_char(day, 'YYYY-MM-DD') AS date,
      sum(planned_minutes)::int AS "focusMinutes",
      count(*)::int AS sessions
    FROM (
      SELECT (started_at AT TIME ZONE ${timeZone})::date AS day, planned_minutes
      FROM focus_sessions
      WHERE user_id = ${userId}::uuid
        AND status = 'COMPLETED'
        AND started_at >= ${at}::timestamptz - interval '367 days'
    ) AS local_sessions
    WHERE day BETWEEN ${today}::date - ${STATS_HEATMAP_DAYS - 1}::int AND ${today}::date
    GROUP BY day
    ORDER BY day
  `;
}

/**
 * Current and longest streak, with the "gaps and islands" trick.
 *
 * 1. `focus_days`: each distinct local day with a completed session.
 * 2. `islands`: number the days in order (row_number) and subtract that
 *    number from the date. Consecutive days move together, so they get the
 *    SAME result; a gap changes it. That result labels each run:
 *
 *      day      row_number   day − row_number
 *      Oct 1    1            Sep 30   ┐ run 1
 *      Oct 2    2            Sep 30   ┘
 *      Oct 5    3            Oct 2    ┐ run 2
 *      Oct 6    4            Oct 2    │
 *      Oct 7    5            Oct 2    ┘
 *
 * 3. `runs`: group by that label to get each run's last day and length.
 * The longest streak is the longest run. The current streak is the run that
 * ends today or yesterday (yesterday counts: today isn't over yet). Two runs
 * can't both qualify, since they'd be touching and so be one run.
 */
async function queryStreak(prisma: PrismaClient, userId: string, timeZone: string, today: string) {
  const [row] = await prisma.$queryRaw<Stats["streak"][]>`
    WITH focus_days AS (
      SELECT DISTINCT (started_at AT TIME ZONE ${timeZone})::date AS day
      FROM focus_sessions
      WHERE user_id = ${userId}::uuid AND status = 'COMPLETED'
    ),
    islands AS (
      SELECT day, day - (row_number() OVER (ORDER BY day))::int AS island
      FROM focus_days
    ),
    runs AS (
      SELECT max(day) AS last_day, count(*)::int AS length
      FROM islands
      GROUP BY island
    )
    SELECT
      coalesce(max(length) FILTER (WHERE last_day >= ${today}::date - 1), 0)::int AS current,
      coalesce(max(length), 0)::int AS longest
    FROM runs
  `;
  return row!;
}

/** Focus minutes by local hour of day (0–23); hours without focus are left out. */
async function queryByHour(prisma: PrismaClient, userId: string, timeZone: string) {
  return prisma.$queryRaw<{ hour: number; focusMinutes: number }[]>`
    SELECT
      extract(hour FROM started_at AT TIME ZONE ${timeZone})::int AS hour,
      sum(planned_minutes)::int AS "focusMinutes"
    FROM focus_sessions
    WHERE user_id = ${userId}::uuid AND status = 'COMPLETED'
    GROUP BY 1
  `;
}

/**
 * Minutes per tag, most first. Grouping by lower(tag) treats "aws" and "AWS"
 * as one tag (the shared rule); array_agg(... ORDER BY started_at DESC)[1]
 * picks its most recent spelling to show. Untagged sessions form one group
 * with tag NULL (lower(NULL) is NULL, and GROUP BY puts NULLs together).
 */
async function queryByTag(prisma: PrismaClient, userId: string) {
  return prisma.$queryRaw<Stats["byTag"]>`
    SELECT
      (array_agg(tag ORDER BY started_at DESC))[1] AS tag,
      sum(planned_minutes)::int AS "focusMinutes",
      count(*)::int AS sessions
    FROM focus_sessions
    WHERE user_id = ${userId}::uuid AND status = 'COMPLETED'
    GROUP BY lower(tag)
    ORDER BY "focusMinutes" DESC, sessions DESC, lower(tag) NULLS LAST
  `;
}
