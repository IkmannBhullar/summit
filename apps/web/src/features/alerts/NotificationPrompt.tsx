export interface NotificationPromptProps {
  /** Called when the user wants notifications (asks the browser for permission). */
  onEnable: () => void;
  /** Called when the user says "Not now"; we won't ask again. */
  onDismiss: () => void;
}

/**
 * A friendly, non-blocking card asking whether to turn on notifications.
 *
 * Shown only after the first completed session, so the user already knows
 * what they'd be notified about. The browser's own permission popup appears
 * only if they click "Turn on".
 */
export function NotificationPrompt({ onEnable, onDismiss }: NotificationPromptProps) {
  return (
    <section
      aria-labelledby="notification-prompt-title"
      className="w-full max-w-md rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
    >
      <h2 id="notification-prompt-title" className="font-semibold">
        Get a heads-up when time&apos;s up?
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Summit can notify you when a session or break ends, even if you&apos;re in another tab.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={onEnable}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          Turn on notifications
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
