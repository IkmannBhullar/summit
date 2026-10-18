/**
 * Small date helpers. "Local" means the user's own time zone: a session
 * finished at 11:30 pm belongs to *that* day for them, whatever UTC says.
 */

/** A sortable key for the local calendar day, e.g. "2026-10-17". */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth() is 0-based
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The local day before `date`, handling month/year boundaries and DST. */
function previousDay(date: Date): Date {
  // Going through the calendar fields (not "minus 24 hours") stays correct
  // on daylight-saving days, which are 23 or 25 hours long.
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
}

/**
 * A friendly label for a day: "Today", "Yesterday", or e.g. "Fri, Oct 10".
 *
 * @param locale - Defaults to the user's language; tests pass one for stable output.
 */
export function dayLabel(date: Date, now: Date, locale?: string): string {
  const key = localDateKey(date);
  if (key === localDateKey(now)) return "Today";
  if (key === localDateKey(previousDay(now))) return "Yesterday";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** A time of day like "9:25 AM" (or "09:25" in 24-hour locales). */
export function timeLabel(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}
