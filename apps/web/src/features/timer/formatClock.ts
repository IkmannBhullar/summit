/**
 * Formats milliseconds as a countdown clock: "25:00", "4:05", "0:01".
 *
 * Rounds *up* to the next whole second, the way countdowns normally work:
 * - the full 25:00 shows at the start (not 24:59 after the first few ms)
 * - "0:01" stays up until time is truly over, and "0:00" means done
 *
 * @param ms - Remaining time in milliseconds; negative values show as "0:00".
 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Pad seconds to two digits ("4:05"), but not minutes ("4:05", not "04:05").
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
