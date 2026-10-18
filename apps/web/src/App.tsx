import { METERS_PER_FOCUS_MINUTE, metersForFocusMinutes } from "@summit/shared";

// Length of a standard focus session, used for the example on the home page.
// The real, configurable value arrives with the timer in Phase 1.
const EXAMPLE_SESSION_MINUTES = 25;

/**
 * Placeholder home page for Phase 0.
 *
 * Its real job is to prove the wiring: React renders, Tailwind styles
 * apply, and values from @summit/shared reach the browser.
 */
export default function App() {
  return (
    // Full-height page, centered content, with light and dark color schemes
    // (the dark: classes follow the operating system's setting).
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <h1 className="text-5xl font-bold tracking-tight text-teal-700 dark:text-teal-400">Summit</h1>

      <p className="max-w-md text-lg text-slate-600 dark:text-slate-400">
        A focus timer where every minute of focus climbs a real mountain.
      </p>

      {/* Both numbers come from packages/shared, so they stay in sync with the server. */}
      <p className="rounded-full bg-teal-100 px-4 py-2 text-sm font-medium text-teal-900 dark:bg-teal-900/40 dark:text-teal-200">
        {METERS_PER_FOCUS_MINUTE} m per focus minute · a {EXAMPLE_SESSION_MINUTES}-minute session climbs{" "}
        {metersForFocusMinutes(EXAMPLE_SESSION_MINUTES)} m
      </p>
    </main>
  );
}
