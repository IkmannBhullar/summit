import type { Stats } from "@summit/shared";
import { formatMinutes } from "./statsFormat";

/** Where focus time goes, per tag. A list of text is already accessible; the bars are decoration. */
export function TagBreakdown({ byTag }: { byTag: Stats["byTag"] }) {
  const max = Math.max(0, ...byTag.map((row) => row.focusMinutes));

  return (
    <section aria-labelledby="tags-heading" className="flex flex-col gap-3">
      <h3 id="tags-heading" className="text-lg font-semibold">
        By tag
      </h3>
      {byTag.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Tag your sessions (like &quot;LeetCode&quot;) to see where your time goes.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {byTag.map((row) => (
            <li key={row.tag ?? "untagged"} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span
                  className={`truncate font-medium ${row.tag ? "" : "text-slate-500 italic dark:text-slate-400"}`}
                >
                  {row.tag ?? "Untagged"}
                </span>
                <span className="shrink-0 text-slate-600 dark:text-slate-400">
                  {formatMinutes(row.focusMinutes)} · {row.sessions}{" "}
                  {row.sessions === 1 ? "session" : "sessions"}
                </span>
              </div>
              <div aria-hidden="true" className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-teal-600 dark:bg-teal-400"
                  style={{ width: `${max === 0 ? 0 : (row.focusMinutes / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
