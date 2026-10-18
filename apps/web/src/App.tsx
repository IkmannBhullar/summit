import { progressFromSessions } from "@summit/shared";
import { MotionConfig } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { MountainView } from "./features/climb/MountainView";
import { SummitCelebration } from "./features/climb/SummitCelebration";
import { useSummitCelebration } from "./features/climb/useSummitCelebration";
import { HistoryList } from "./features/history/HistoryList";
import { useSessionHistory } from "./features/history/useSessionHistory";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { useSettings } from "./features/settings/useSettings";
import type { TimerEvent } from "./features/timer/timerMachine";
import { TimerScreen } from "./features/timer/TimerScreen";
import { localDateKey } from "./lib/dates";
import { useNow } from "./lib/useNow";

/**
 * App shell: the page layout around the features, plus app-wide state
 * (settings, session history) that more than one feature needs.
 */
export default function App() {
  const [settings, saveSettings] = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { sessions, addSession } = useSessionHistory();
  const now = useNow();

  // Climb progress is derived from history, never stored separately
  // (decision 011). useMemo re-computes it only when sessions change.
  const progress = useMemo(() => progressFromSessions(sessions), [sessions]);
  const celebration = useSummitCelebration(progress);

  const todayKey = localDateKey(now);
  const completedToday = sessions.filter(
    (session) =>
      session.status === "COMPLETED" &&
      session.endedAt !== null &&
      localDateKey(new Date(session.endedAt)) === todayKey,
  ).length;

  // Every finished focus session (completed or abandoned) goes into history.
  const handleTimerEvent = useCallback(
    (event: TimerEvent) => {
      if (event.type === "focusCompleted" || event.type === "focusAbandoned") {
        addSession(event.session);
      }
    },
    [addSession],
  );

  return (
    // reducedMotion="user": Motion skips movement animations for people whose
    // operating system is set to "reduce motion".
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="flex items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
            Summit
          </h1>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            // Icon-only button: the label is what screen readers announce.
            aria-label="Timer settings"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <SlidersIcon />
          </button>
        </header>

        <main className="flex flex-1 flex-col items-center gap-12 px-6 pt-6 pb-16">
          <MountainView progress={progress} />
          <TimerScreen
            settings={settings}
            onEvent={handleTimerEvent}
            completedToday={completedToday}
          />
          <HistoryList sessions={sessions} now={now} />
        </main>

        <SettingsDialog
          open={settingsOpen}
          settings={settings}
          onSave={(next) => {
            saveSettings(next);
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />

        <SummitCelebration
          peak={celebration.summitedPeak}
          nextPeak={celebration.nextPeak}
          onClose={celebration.dismiss}
        />
      </div>
    </MotionConfig>
  );
}

/** A simple "sliders" icon for the settings button (decorative, so hidden from screen readers). */
function SlidersIcon() {
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
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}
