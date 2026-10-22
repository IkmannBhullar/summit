import type { Stats } from "@summit/shared";
import { useEffect, useRef } from "react";
import { buildHeatmap, formatDate, formatMinutes } from "./statsFormat";

/**
 * Square size and spacing, in SVG units (= CSS pixels: the drawing isn't
 * scaled). 53 weeks × 13 = 689 px, so a whole year fits beside the labels
 * on a laptop; phones scroll.
 */
const CELL = 10;
const STEP = 13;
/** Width of the weekday label column, and room on top for month labels. */
const LABELS_WIDTH = 28;
const TOP = 16;

/** Fill per shade level, 0 (no focus) to 4 (lots). Full class names so Tailwind finds them. */
const LEVEL_FILLS = [
  "fill-slate-200 dark:fill-slate-800",
  "fill-teal-200 dark:fill-teal-900",
  "fill-teal-400 dark:fill-teal-700",
  "fill-teal-600 dark:fill-teal-500",
  "fill-teal-800 dark:fill-teal-300",
] as const;

/** Only Mon, Wed, Fri are labelled, like GitHub, so the labels don't crowd. */
const WEEKDAY_LABELS: Record<number, string> = { 1: "Mon", 3: "Wed", 5: "Fri" };

export interface HeatmapProps {
  days: Stats["days"];
  today: string;
  locale?: string;
}

/** A year of focus as a grid of days, darker for more focus. */
export function FocusHeatmap({ days, today, locale }: HeatmapProps) {
  const { weeks, months, activeDays } = buildHeatmap(days, today, { locale });
  const scroller = useRef<HTMLDivElement>(null);

  // Start scrolled to the newest weeks (on phones the year doesn't fit).
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, []);

  const width = weeks.length * STEP;
  const height = TOP + 7 * STEP;
  const summary = `Focus on ${activeDays} of the last 365 days`;

  return (
    <section aria-labelledby="heatmap-heading" className="flex flex-col gap-3">
      <h3 id="heatmap-heading" className="text-lg font-semibold">
        The last year
      </h3>
      <div className="flex">
        {/* Weekday labels stay put while the weeks scroll past them. */}
        <svg width={LABELS_WIDTH} height={height} aria-hidden="true" className="block shrink-0">
          {Object.entries(WEEKDAY_LABELS).map(([row, label]) => (
            <text
              key={label}
              x={0}
              y={TOP + Number(row) * STEP + CELL - 1}
              className="fill-slate-500 text-[10px] dark:fill-slate-400"
            >
              {label}
            </text>
          ))}
        </svg>
        {/* A scrollable box must be reachable by keyboard to be scrollable by
            keyboard: tabIndex={0} makes it focusable, and the label says what it is. */}
        <div
          ref={scroller}
          tabIndex={0}
          role="region"
          aria-label="Focus heatmap (scrolls sideways)"
          className="min-w-0 overflow-x-auto rounded-lg pb-2"
        >
          <svg width={width} height={height} role="img" aria-label={summary} className="block">
            {months.map((month) => (
              <text
                key={`${month.label}-${month.week}`}
                x={month.week * STEP}
                y={10}
                className="fill-slate-500 text-[10px] dark:fill-slate-400"
              >
                {month.label}
              </text>
            ))}
            {weeks.map((week, column) =>
              week.map(
                (day, row) =>
                  day && (
                    <rect
                      key={day.date}
                      x={column * STEP}
                      y={TOP + row * STEP}
                      width={CELL}
                      height={CELL}
                      rx={2}
                      className={LEVEL_FILLS[day.level]}
                    >
                      {/* A hover tooltip for mouse users. */}
                      <title>{`${formatDate(day.date, locale)}: ${formatMinutes(day.focusMinutes)}`}</title>
                    </rect>
                  ),
              ),
            )}
          </svg>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1 text-xs text-slate-500 dark:text-slate-400">
        <span>Less</span>
        <svg width={5 * STEP} height={CELL} aria-hidden="true">
          {LEVEL_FILLS.map((fill, level) => (
            <rect key={level} x={level * STEP} width={CELL} height={CELL} rx={2} className={fill} />
          ))}
        </svg>
        <span>More</span>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-teal-700 dark:text-teal-400">
          Show as a table
        </summary>
        {activeDays === 0 ? (
          <p className="mt-2 text-slate-600 dark:text-slate-400">No focus in the last year yet.</p>
        ) : (
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{summary}, newest first</caption>
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th scope="col" className="py-1 font-medium">
                  Day
                </th>
                <th scope="col" className="py-1 font-medium">
                  Focus
                </th>
                <th scope="col" className="py-1 font-medium">
                  Sessions
                </th>
              </tr>
            </thead>
            <tbody>
              {weeks
                .flat()
                .filter((day) => day !== null && day.focusMinutes > 0)
                .reverse()
                .map((day) => (
                  <tr key={day!.date}>
                    <td className="py-1">{formatDate(day!.date, locale)}</td>
                    <td className="py-1">{formatMinutes(day!.focusMinutes)}</td>
                    <td className="py-1">{day!.sessions}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  );
}
