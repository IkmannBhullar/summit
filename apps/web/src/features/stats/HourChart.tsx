import { formatHour, formatMinutes } from "./statsFormat";

/** Bar width, spacing, and chart height, in SVG units (the drawing scales to fit). */
const BAR = 10;
const STEP = 14;
const HEIGHT = 80;
const LABEL_SPACE = 16;
/** Hours that get a label under the axis. */
const LABELLED_HOURS = [0, 6, 12, 18];

export interface HourChartProps {
  /** Focus minutes for each hour of the day, 0 to 23. */
  byHour: readonly number[];
  locale?: string;
}

/** When in the day you focus: 24 bars, one per starting hour. */
export function HourChart({ byHour, locale }: HourChartProps) {
  const max = Math.max(...byHour);
  const peak = byHour.indexOf(max);
  const summary =
    max === 0
      ? "No focus by hour yet"
      : `Focus by hour of day. Most focus starts at ${formatHour(peak, locale)}.`;

  return (
    <section aria-labelledby="hours-heading" className="flex flex-col gap-3">
      <h3 id="hours-heading" className="text-lg font-semibold">
        Time of day
      </h3>
      <svg
        viewBox={`0 0 ${24 * STEP} ${HEIGHT + LABEL_SPACE}`}
        role="img"
        aria-label={summary}
        className="w-full"
      >
        {byHour.map((minutes, hour) => {
          // Even an empty hour shows a 2-unit stub, so the axis reads as 24 slots.
          const barHeight = max === 0 ? 2 : Math.max(2, (minutes / max) * HEIGHT);
          return (
            <rect
              key={hour}
              x={hour * STEP}
              y={HEIGHT - barHeight}
              width={BAR}
              height={barHeight}
              rx={2}
              className={
                minutes > 0
                  ? "fill-teal-600 dark:fill-teal-400"
                  : "fill-slate-200 dark:fill-slate-800"
              }
            >
              <title>{`${formatHour(hour, locale)}: ${formatMinutes(minutes)}`}</title>
            </rect>
          );
        })}
        {LABELLED_HOURS.map((hour) => (
          <text
            key={hour}
            x={hour * STEP}
            y={HEIGHT + 12}
            className="fill-slate-500 text-[9px] dark:fill-slate-400"
          >
            {formatHour(hour, locale)}
          </text>
        ))}
      </svg>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-teal-700 dark:text-teal-400">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">Focus by the hour sessions started</caption>
          <thead>
            <tr className="text-slate-500 dark:text-slate-400">
              <th scope="col" className="py-1 font-medium">
                Hour
              </th>
              <th scope="col" className="py-1 font-medium">
                Focus
              </th>
            </tr>
          </thead>
          <tbody>
            {byHour.map(
              (minutes, hour) =>
                minutes > 0 && (
                  <tr key={hour}>
                    <td className="py-1">{formatHour(hour, locale)}</td>
                    <td className="py-1">{formatMinutes(minutes)}</td>
                  </tr>
                ),
            )}
          </tbody>
        </table>
      </details>
    </section>
  );
}
