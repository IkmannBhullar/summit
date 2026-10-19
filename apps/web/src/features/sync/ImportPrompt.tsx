import type { GuestImport } from "./useGuestImport";

const sessionsLabel = (count: number) => `${count} ${count === 1 ? "session" : "sessions"}`;

/**
 * The offer to import guest history, and afterwards, what happened.
 * Rendered only for signed-in users (see TimerPage).
 */
export function ImportPrompt({
  guestImport,
  onDecline,
}: {
  guestImport: GuestImport;
  onDecline: () => void;
}) {
  const { count, offered, importNow, isImporting, result, error } = guestImport;

  if (result) {
    return (
      <p
        role="status"
        className="w-full max-w-md rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100"
      >
        Imported {sessionsLabel(result.imported)} into your account.
        {result.skipped > 0 &&
          ` ${sessionsLabel(result.skipped)} couldn't be imported (they overlapped other sessions or happened after your account was created).`}
      </p>
    );
  }

  if (!offered) return null;

  return (
    <section
      aria-labelledby="import-title"
      className="w-full max-w-md rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
    >
      <h2 id="import-title" className="font-semibold">
        Bring your climb with you?
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        This device has {sessionsLabel(count)} from before you signed in. Import{" "}
        {count === 1 ? "it" : "them"} into your account?
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          Import failed: {error.message}
        </p>
      )}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={importNow}
          disabled={isImporting}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          {isImporting ? "Importing…" : `Import ${sessionsLabel(count)}`}
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={isImporting}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
