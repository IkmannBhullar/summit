import { useCallback, useState } from "react";
import { alertFor } from "../features/alerts/alertFor";
import { chime } from "../features/alerts/chime";
import { NotificationPrompt } from "../features/alerts/NotificationPrompt";
import {
  notificationStatus,
  requestNotificationPermission,
  showNotification,
} from "../features/alerts/notifications";
import { useCurrentUser } from "../features/auth/useAuth";
import { MountainView } from "../features/climb/MountainView";
import { SummitCelebration } from "../features/climb/SummitCelebration";
import { useSummitCelebration } from "../features/climb/useSummitCelebration";
import { HistoryList } from "../features/history/HistoryList";
import { ImportPrompt } from "../features/sync/ImportPrompt";
import { useGuestImport } from "../features/sync/useGuestImport";
import { useSessionStore } from "../features/sync/useSessionStore";
import type { TimerEvent } from "../features/timer/timerMachine";
import { TimerScreen } from "../features/timer/TimerScreen";
import { localDateKey } from "../lib/dates";
import { useNow } from "../lib/useNow";
import { useShell } from "../shell";

/** "/": the mountain, the timer, and history, for guests and signed-in users alike. */
export function TimerPage() {
  const { user, isLoading, likelySignedIn } = useCurrentUser();

  // Someone was signed in here last time: wait briefly for the account,
  // rather than flashing this device's guest data first.
  if (isLoading && likelySignedIn) {
    return (
      <main className="flex flex-1 justify-center pt-16">
        <p role="status" className="text-slate-500">
          Loading your climb…
        </p>
      </main>
    );
  }

  // `key`: switching between guest and an account remounts the page, so
  // nothing (like the summits already celebrated) carries over between them.
  return <TimerPageContent key={user?.id ?? "guest"} userId={user?.id ?? null} />;
}

function TimerPageContent({ userId }: { userId: string | null }) {
  const { settings, preferences, updatePreferences } = useShell();
  const { store, guestHistory } = useSessionStore(userId !== null);
  const guestImport = useGuestImport({
    guestHistory,
    declined: userId !== null && preferences.importDeclinedFor.includes(userId),
  });
  const now = useNow();
  // The browser's notification permission, re-read after we ask.
  const [notifications, setNotifications] = useState(notificationStatus);
  const celebration = useSummitCelebration(store.progress);

  const todayKey = localDateKey(now);
  const completedToday = store.sessions.filter(
    (session) =>
      session.status === "COMPLETED" &&
      session.endedAt !== null &&
      localDateKey(new Date(session.endedAt)) === todayKey,
  ).length;

  // React to timer events: save them (locally or to the account), then chime and notify.
  const { handleTimerEvent: saveEvent } = store;
  const handleTimerEvent = useCallback(
    (event: TimerEvent) => {
      saveEvent(event);
      const alert = alertFor(event);
      if (alert) {
        if (preferences.soundEnabled) chime.play(alert.chime);
        // Only appears if permission was granted and the tab is hidden.
        void showNotification(alert.title, alert.body);
      }
    },
    [saveEvent, preferences.soundEnabled],
  );

  // Ask nicely: only after a first completed session, only if the browser
  // hasn't been asked yet, and never again after "Not now".
  const showNotificationPrompt =
    notifications === "default" &&
    !preferences.notificationPromptDismissed &&
    store.sessions.some((session) => session.status === "COMPLETED");

  const enableNotifications = async () => {
    setNotifications(await requestNotificationPermission());
    // Whatever they answered, the browser remembers it; don't show the card again.
    updatePreferences({ notificationPromptDismissed: true });
  };

  return (
    // Phones: one column (mountain, timer, history). Wide screens (lg,
    // 1024px+): mountain and timer side by side, history below.
    <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 justify-items-center gap-6 px-6 pt-2 pb-[max(4rem,env(safe-area-inset-bottom))] sm:gap-10 lg:grid-cols-2 lg:items-center lg:gap-x-16 lg:pt-8">
      {store.progress ? (
        <MountainView progress={store.progress} />
      ) : (
        <p role="status" className="self-center text-slate-500">
          Loading your climb…
        </p>
      )}
      <TimerScreen
        settings={settings}
        onEvent={handleTimerEvent}
        completedToday={completedToday}
        recentTags={store.recentTags}
        tag={preferences.focusTag}
        onTagChange={(focusTag) => updatePreferences({ focusTag })}
      />
      <div className="flex w-full flex-col items-center gap-8 lg:col-span-2">
        {store.syncProblem && (
          <p
            role="alert"
            className="w-full max-w-md rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            {store.syncProblem}
          </p>
        )}
        {userId !== null && (
          <ImportPrompt
            guestImport={guestImport}
            onDecline={() =>
              updatePreferences({ importDeclinedFor: [...preferences.importDeclinedFor, userId] })
            }
          />
        )}
        {showNotificationPrompt && (
          <NotificationPrompt
            onEnable={() => void enableNotifications()}
            onDismiss={() => updatePreferences({ notificationPromptDismissed: true })}
          />
        )}
        <HistoryList
          sessions={store.sessions}
          now={now}
          hasOlder={store.hasOlder}
          onLoadOlder={store.loadOlder}
        />
      </div>

      <SummitCelebration
        peak={celebration.summitedPeak}
        nextPeak={celebration.nextPeak}
        onClose={celebration.dismiss}
      />
    </main>
  );
}
