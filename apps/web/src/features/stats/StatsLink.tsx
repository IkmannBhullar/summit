import { Link } from "react-router";

/**
 * The header's stats link. Only on screens 640 px and wider: on phones the
 * header has no room for another button, so the link sits by History instead.
 */
export function StatsLink() {
  return (
    <Link
      to="/stats"
      aria-label="Stats"
      className="hidden rounded-lg p-2.5 text-slate-600 hover:bg-slate-200 sm:inline-flex dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <ChartIcon />
    </Link>
  );
}

/** A small bar chart (decorative, so hidden from screen readers). */
function ChartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />
    </svg>
  );
}
