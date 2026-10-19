import { progressFromSessions } from "@summit/shared";
import { useCallback, useMemo, useState } from "react";
import { alertFor } from "../features/alerts/alertFor";
import { chime } from "../features/alerts/chime";
import { NotificationPrompt } from "../features/alerts/NotificationPrompt";
import {
  notificationStatus,
  requestNotificationPermission,
  showNotification,
} from "../features/alerts/notifications";
import { MountainView } from "../features/climb/MountainView";
import { SummitCelebration } from "../features/climb/SummitCelebration";
import { useSummitCelebration } from "../features/climb/useSummitCelebration";
import { HistoryList } from "../features/history/HistoryList";
import { useSessionHistory } from "../features/history/useSessionHistory";
import type { TimerEvent } from "../features/timer/timerMachine";
import { TimerScreen } from "../features/timer/TimerScreen";
import { localDateKey } from "../lib/dates";
import { useNow } from "../lib/useNow";
import { useShell } from "../shell";

/** "/": the mountain, the timer, and history. */
export function TimerPage() {
  const { settings, preferences, updatePreferences } = useShell();
  const { sessions, addSession } = useSessionHistory();
  const now = useNow();
  // The browser's notification permission, re-read after we ask.
  const [notifications, setNotifications] = useState(notificationStatus);

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

  // React to timer events: record finished sessions, then chime and notify.
  const handleTimerEvent = useCallback(
    (event: TimerEvent) => {
      if (event.type === "focusCompleted" || event.type === "focusAbandoned") {
        addSession(event.session);
      }
      const alert = alertFor(event);
      if (alert) {
        if (preferences.soundEnabled) chime.play(alert.chime);
        // Only appears if permission was granted and the tab is hidden.
        void showNotification(alert.title, alert.body);
      }
    },
    [addSession, preferences.soundEnabled],
  );

  // Ask nicely: only after a first completed session, only if the browser
  // hasn't been asked yet, and never again after "Not now".
  const showNotificationPrompt =
    notifications === "default" &&
    !preferences.notificationPromptDismissed &&
    sessions.some((session) => session.status === "COMPLETED");

  const enableNotifications = async () => {
    setNotifications(await requestNotificationPermission());
    // Whatever they answered, the browser remembers it; don't show the card again.
    updatePreferences({ notificationPromptDismissed: true });
  };

  return (
    // Phones: one column (mountain, timer, history). Wide screens (lg,
    // 1024px+): mountain and timer side by side, history below.
    <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 justify-items-center gap-6 px-6 pt-2 pb-[max(4rem,env(safe-area-inset-bottom))] sm:gap-10 lg:grid-cols-2 lg:items-center lg:gap-x-16 lg:pt-8">
      <MountainView progress={progress} />
      <TimerScreen settings={settings} onEvent={handleTimerEvent} completedToday={completedToday} />
      <div className="flex w-full flex-col items-center gap-8 lg:col-span-2">
        {showNotificationPrompt && (
          <NotificationPrompt
            onEnable={() => void enableNotifications()}
            onDismiss={() => updatePreferences({ notificationPromptDismissed: true })}
          />
        )}
        <HistoryList sessions={sessions} now={now} />
      </div>

      <SummitCelebration
        peak={celebration.summitedPeak}
        nextPeak={celebration.nextPeak}
        onClose={celebration.dismiss}
      />
    </main>
  );
}
