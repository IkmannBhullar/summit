import { getCurrentClimb, type ClimbProgress } from "@summit/shared";

/** Formats meters with thousands separators, e.g. "3,776 m". */
const meters = (value: number) => `${value.toLocaleString()} m`;

/**
 * A one-line summary of the current climb. Step 6 replaces this with the
 * animated mountain view.
 */
export function ClimbSummary({ progress }: { progress: ClimbProgress }) {
  const current = getCurrentClimb(progress);

  if (!current) {
    return <p className="font-medium text-teal-700 dark:text-teal-400">Every peak summited!</p>;
  }

  return (
    <p className="text-center text-slate-600 dark:text-slate-400">
      Climbing{" "}
      <span className="font-semibold text-slate-900 dark:text-slate-100">{current.peak.name}</span>
      {" · "}
      {meters(current.climb.metersGained)} of {meters(current.peak.heightMeters)}
      {" · "}
      {meters(current.metersToSummit)} to go
    </p>
  );
}
