/**
 * Browser notifications ("Session complete!" popping up outside the page).
 *
 * Rules we follow:
 * - Only ask for permission after the user has seen the value (their first
 *   completed session), and only when they click a button. Browsers also
 *   punish sites that ask on page load by auto-blocking them.
 * - Only notify when the page is hidden. If they're looking at Summit, the
 *   on-page message and chime are enough.
 * - Never throw: a notification is nice-to-have, never critical.
 */

/** The browser's permission state, plus "unsupported" for browsers without notifications. */
export type NotificationStatus = NotificationPermission | "unsupported";

/** Current permission: "default" (not asked yet), "granted", "denied", or "unsupported". */
export function notificationStatus(): NotificationStatus {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/**
 * Asks the user for permission. Must be called from a click (or similar):
 * browsers ignore permission requests that aren't triggered by the user.
 */
export async function requestNotificationPermission(): Promise<NotificationStatus> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Shows a notification if permission is granted and the page is hidden.
 *
 * Prefers the service worker's showNotification(), which is required on
 * Android (where `new Notification()` throws) and keeps working once the app
 * is installed (Step 8). Falls back to `new Notification()` on desktop.
 */
export async function showNotification(title: string, body: string): Promise<void> {
  if (notificationStatus() !== "granted") return;
  if (document.visibilityState === "visible") return;

  const options: NotificationOptions = {
    body,
    icon: "/favicon.svg",
    // Same tag = a new notification replaces the old one instead of stacking up.
    tag: "summit-timer",
  };

  try {
    const registration =
      "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    // Unsupported here, or blocked at the last moment: skip silently.
  }
}
