import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs` and whenever the tab
 * becomes visible again. For things like "Today" labels and daily counts,
 * which only need to notice when the date changes (e.g. at midnight).
 *
 * Reading the clock in a hook (instead of `new Date()` while rendering)
 * keeps components pure and makes "now" controllable in tests.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const update = () => setNow(new Date());
    const id = setInterval(update, intervalMs);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, [intervalMs]);

  return now;
}
