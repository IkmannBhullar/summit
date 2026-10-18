import { TimerScreen } from "./features/timer/TimerScreen";

/**
 * App shell: the page layout around the features.
 * Phase 1 adds the mountain, history, and settings around the timer step by step.
 */
export default function App() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
          Summit
        </h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <TimerScreen />
      </main>
    </div>
  );
}
