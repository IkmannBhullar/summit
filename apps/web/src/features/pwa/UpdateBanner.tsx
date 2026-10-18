export interface UpdateBannerProps {
  /** A new version has been downloaded and is waiting. */
  needRefresh: boolean;
  /** Everything is cached: the app now works with no network. */
  offlineReady: boolean;
  /** Switch to the new version (reloads the page). */
  onReload: () => void;
  /** Hide the banner. */
  onClose: () => void;
}

/**
 * A small banner at the bottom of the screen about app updates.
 *
 * It only shows information; UpdatePrompt connects it to the service worker.
 * Keeping the two apart lets us test this part without a real service worker.
 */
export function UpdateBanner({ needRefresh, offlineReady, onReload, onClose }: UpdateBannerProps) {
  if (!needRefresh && !offlineReady) return null;

  return (
    // role="status": screen readers announce it politely, without interrupting.
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-2xl bg-slate-900 p-4 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
    >
      <p className="flex-1">
        {needRefresh
          ? "A new version of Summit is ready. Reloading keeps any session in progress."
          : "Summit is ready to work offline."}
      </p>
      <div className="flex gap-2">
        {needRefresh && (
          <button
            type="button"
            onClick={onReload}
            className="rounded-lg bg-teal-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-teal-400"
          >
            Reload
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 font-medium ring-1 ring-white/30 hover:bg-white/10 dark:ring-slate-900/30 dark:hover:bg-slate-900/10"
        >
          {needRefresh ? "Later" : "OK"}
        </button>
      </div>
    </div>
  );
}
