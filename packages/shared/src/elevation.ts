/**
 * Elevation rules shared by the web app and the server.
 *
 * Keeping these in one place means the client's "you'll gain 250 m" preview
 * and the server's real calculation can never disagree.
 */

/** Meters of elevation gained for each fully completed focus minute. */
export const METERS_PER_FOCUS_MINUTE = 10;

/**
 * Converts completed focus minutes into meters gained.
 *
 * Only whole minutes count: 24.9 minutes is still 24 completed minutes.
 *
 * @param completedMinutes - Focus minutes the user actually finished.
 * @returns Meters of elevation earned.
 * @throws RangeError if the input is negative or not a finite number,
 *   because that always means a bug upstream (e.g. a bad timestamp).
 */
export function metersForFocusMinutes(completedMinutes: number): number {
  // Guard against NaN, Infinity and negatives instead of silently returning nonsense.
  if (!Number.isFinite(completedMinutes) || completedMinutes < 0) {
    throw new RangeError(`completedMinutes must be a non-negative number, got ${completedMinutes}`);
  }

  // Drop the partial minute, then convert to meters.
  return Math.floor(completedMinutes) * METERS_PER_FOCUS_MINUTE;
}
