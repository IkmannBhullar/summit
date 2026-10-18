import type { FocusSession } from "@summit/shared";
import { useState } from "react";
import { timeLabel } from "../../lib/dates";
import { groupByDay } from "./groupByDay";

/** How many sessions to show at first, and how many more each "Show more" adds. */
export const HISTORY_PAGE_SIZE = 20;

export interface HistoryListProps {
  /** All finished sessions, in any order. */
  sessions: readonly FocusSession[];
  /** The current time, for "Today"/"Yesterday" labels. */
  now: Date;
  /** Date/time formatting language; defaults to the user's. */
  locale?: string;
}

/** Past sessions grouped by day, newest first. */
export function HistoryList({ sessions, now, locale }: HistoryListProps) {
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);

  // Show the newest sessions first and only a page at a time. Grouping only
  // the visible slice keeps rendering cheap even with years of history.
  const newestFirst = sessions.toSorted(
    (a, b) => Date.parse(b.endedAt ?? b.startedAt) - Date.parse(a.endedAt ?? a.startedAt),
  );
  const groups = groupByDay(newestFirst.slice(0, visibleCount), now, locale);
  const hiddenCount = Math.max(0, sessions.length - visibleCount);

  return (
    <section aria-labelledby="history-heading" className="w-full max-w-md">
      <h2 id="history-heading" className="text-lg font-semibold">
        History
      </h2>

      {sessions.length === 0 ? (
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          No sessions yet. Your climbs will show up here.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.key}>
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {group.label}
              </h3>
              <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-800">
                {group.sessions.map((session) => (
                  <HistoryItem key={session.id} session={session} locale={locale} />
                ))}
              </ul>
            </div>
          ))}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
              className="self-start text-sm font-medium text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
            >
              Show more ({hiddenCount} older)
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** One row: when, how long, and how it went. */
function HistoryItem({ session, locale }: { session: FocusSession; locale?: string }) {
  const completed = session.status === "COMPLETED";
  return (
    <li className="flex items-center justify-between py-2">
      <span>
        <span className="font-medium">{timeLabel(new Date(session.startedAt), locale)}</span>
        <span className="text-slate-500 dark:text-slate-400">
          {" "}
          · {session.plannedMinutes} min focus
        </span>
      </span>
      {completed ? (
        <span className="font-medium text-teal-700 dark:text-teal-400">
          +{session.metersGained} m
        </span>
      ) : (
        <span className="text-slate-500 dark:text-slate-400">Gave up</span>
      )}
    </li>
  );
}
