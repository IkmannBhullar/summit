import type { FocusSession } from "@summit/shared";
import { dayLabel, localDateKey } from "../../lib/dates";

/** Sessions from one local calendar day. */
export interface DayGroup {
  /** e.g. "2026-10-17": a stable React key. */
  key: string;
  /** e.g. "Today", "Yesterday", "Fri, Oct 10". */
  label: string;
  /** That day's sessions, newest first. */
  sessions: FocusSession[];
}

/** When a session happened, for sorting and grouping: its end, or its start if unfinished. */
const sessionTime = (session: FocusSession) => new Date(session.endedAt ?? session.startedAt);

/**
 * Groups sessions by the local day they happened on, newest day first.
 *
 * @param now - The current time, for "Today"/"Yesterday" labels.
 * @param locale - Passed through to the date labels (tests use "en-US").
 */
export function groupByDay(
  sessions: readonly FocusSession[],
  now: Date,
  locale?: string,
): DayGroup[] {
  const newestFirst = sessions.toSorted(
    (a, b) => sessionTime(b).getTime() - sessionTime(a).getTime(),
  );

  const groups: DayGroup[] = [];
  for (const session of newestFirst) {
    const time = sessionTime(session);
    const key = localDateKey(time);
    // Sessions are sorted, so a session's day is either the last group's or a new one.
    const current = groups.at(-1);
    if (current?.key === key) {
      current.sessions.push(session);
    } else {
      groups.push({ key, label: dayLabel(time, now, locale), sessions: [session] });
    }
  }
  return groups;
}
