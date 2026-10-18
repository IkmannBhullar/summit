/**
 * Climb progression: how completed focus time moves a user up the peaks.
 *
 * Everything here is a *pure function*: same input, same output, no clock,
 * no storage, no mutation. The web app uses it now; in Phase 2 the server
 * will run exactly the same code, so the server decides elevation (players
 * can't cheat by editing the client) and both sides always agree.
 */
import { z } from "zod";
import { findPeak, PEAKS, type Peak } from "./peaks";

/** Progress on one peak. Mirrors the future `Climb` database table. */
export const ClimbSchema = z.object({
  peakId: z.string().min(1),
  /** Meters climbed on this peak so far (0 … peak height). */
  metersGained: z.number().int().nonnegative(),
  /** ISO timestamp of reaching the summit, or null while still climbing. */
  summitedAt: z.iso.datetime().nullable(),
});
export type Climb = z.infer<typeof ClimbSchema>;

/**
 * A user's whole journey: one entry per peak started, in unlock order.
 * Every entry except possibly the last is summited; the last unsummited
 * one is the peak currently being climbed.
 */
export const ClimbProgressSchema = z.object({
  climbs: z.array(ClimbSchema).min(1),
});
export type ClimbProgress = z.infer<typeof ClimbProgressSchema>;

/** Starting point for a new user: at 0 m on the first peak. */
export function createInitialProgress(peaks: readonly Peak[] = PEAKS): ClimbProgress {
  const firstPeak = peaks[0];
  if (!firstPeak) {
    throw new Error("Cannot start a climb: the peaks list is empty");
  }
  return { climbs: [{ peakId: firstPeak.id, metersGained: 0, summitedAt: null }] };
}

/** The peak currently being climbed, with how far there is to go. */
export interface CurrentClimb {
  peak: Peak;
  climb: Climb;
  metersToSummit: number;
}

/**
 * Finds the peak in progress.
 *
 * @returns The current climb, or `null` once every peak has been summited.
 */
export function getCurrentClimb(
  progress: ClimbProgress,
  peaks: readonly Peak[] = PEAKS,
): CurrentClimb | null {
  const climb = progress.climbs.at(-1);
  // No climbs, or the last one is summited and nothing came after it: all done.
  if (!climb || climb.summitedAt !== null) {
    return null;
  }

  const peak = requirePeak(climb.peakId, peaks);
  return { peak, climb, metersToSummit: peak.heightMeters - climb.metersGained };
}

/** What happened when meters were added. */
export interface ApplyMetersResult {
  /** The new progress (a new object; the input is never modified). */
  progress: ClimbProgress;
  /** Peaks summited by this addition, in order. Usually empty, sometimes one. */
  summitedPeaks: Peak[];
  /** Meters left over after the final peak was summited (nowhere left to climb). */
  unusedMeters: number;
}

/**
 * Adds elevation from a completed focus session.
 *
 * If the meters take the user past a summit, the peak is marked summited at
 * `now`, the next peak unlocks, and the extra meters carry over to it
 * (see docs/decisions.md). Abandoned sessions should never call this.
 *
 * @param meters - Meters earned; a non-negative whole number.
 * @param now - When the meters were earned; used as the summit timestamp.
 * @throws RangeError if `meters` is negative or not a whole number.
 */
export function applyMeters(
  progress: ClimbProgress,
  meters: number,
  now: Date,
  peaks: readonly Peak[] = PEAKS,
): ApplyMetersResult {
  if (!Number.isInteger(meters) || meters < 0) {
    throw new RangeError(`meters must be a non-negative whole number, got ${meters}`);
  }

  // Copy every climb so we can update them without touching the caller's
  // objects. (React relies on state never being mutated in place.)
  const climbs = progress.climbs.map((climb) => ({ ...climb }));
  const summitedPeaks: Peak[] = [];
  let remaining = meters;

  while (remaining > 0) {
    const current = climbs.at(-1);
    // Every peak is already summited: nothing left to climb.
    if (!current || current.summitedAt !== null) {
      break;
    }

    const peak = requirePeak(current.peakId, peaks);
    const metersToSummit = peak.heightMeters - current.metersGained;

    // Not enough to reach the top: just climb higher and stop.
    if (remaining < metersToSummit) {
      current.metersGained += remaining;
      remaining = 0;
      break;
    }

    // Enough to summit: top out this peak and carry the rest over.
    current.metersGained = peak.heightMeters;
    current.summitedAt = now.toISOString();
    summitedPeaks.push(peak);
    remaining -= metersToSummit;

    // Unlock the next peak. `order` is 1-based, so peaks[order] is the next one.
    const nextPeak = peaks[peak.order];
    if (nextPeak) {
      climbs.push({ peakId: nextPeak.id, metersGained: 0, summitedAt: null });
    }
  }

  return { progress: { climbs }, summitedPeaks, unusedMeters: remaining };
}

/** Looks up a peak that must exist; a missing one means saved data is corrupt. */
function requirePeak(peakId: string, peaks: readonly Peak[]): Peak {
  const peak = findPeak(peakId, peaks);
  if (!peak) {
    throw new Error(`Unknown peak id in climb progress: "${peakId}"`);
  }
  return peak;
}
