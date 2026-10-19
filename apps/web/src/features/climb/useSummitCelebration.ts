import { findPeak, PEAKS, type ClimbProgress, type Peak } from "@summit/shared";
import { useState } from "react";

export interface SummitCelebration {
  /** The peak to celebrate right now, or null if there's nothing new. */
  summitedPeak: Peak | null;
  /** The peak that just unlocked, or null after the final summit. */
  nextPeak: Peak | null;
  /** Marks the current celebration as seen. */
  dismiss: () => void;
}

/**
 * Decides when to celebrate a summit.
 *
 * It remembers how many summits the user has already *seen*, starting with
 * the ones that existed when the app opened (so old summits aren't
 * re-celebrated on every visit). Any summit beyond that count is new.
 *
 * This is derived during render instead of detected in an effect, so there
 * is no "compare old and new progress, then set state" step to get wrong.
 */
export function useSummitCelebration(progress: ClimbProgress | undefined): SummitCelebration {
  const summitedClimbs = progress?.climbs.filter((climb) => climb.summitedAt !== null) ?? [];
  // How many summits have been seen. Null until progress first arrives (it
  // may load from the server): existing summits are then counted as seen,
  // so opening the app never replays old celebrations.
  const [seen, setSeen] = useState<number | null>(progress ? summitedClimbs.length : null);
  if (progress && seen === null) setSeen(summitedClimbs.length);
  const seenCount = seen ?? summitedClimbs.length;

  // The oldest summit not celebrated yet (several in a row show one by one).
  const unseen = summitedClimbs[seenCount];
  const summitedPeak = unseen ? (findPeak(unseen.peakId) ?? null) : null;
  // `order` is 1-based, so PEAKS[order] is the peak after this one.
  const nextPeak = summitedPeak ? (PEAKS[summitedPeak.order] ?? null) : null;

  return {
    summitedPeak,
    nextPeak,
    dismiss: () => setSeen((count) => (count ?? 0) + 1),
  };
}
