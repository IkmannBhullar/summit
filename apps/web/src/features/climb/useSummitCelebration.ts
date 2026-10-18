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
export function useSummitCelebration(progress: ClimbProgress): SummitCelebration {
  const summitedClimbs = progress.climbs.filter((climb) => climb.summitedAt !== null);
  // The initial value is only used on the first render.
  const [seenCount, setSeenCount] = useState(summitedClimbs.length);

  // The oldest summit not celebrated yet (several in a row show one by one).
  const unseen = summitedClimbs[seenCount];
  const summitedPeak = unseen ? (findPeak(unseen.peakId) ?? null) : null;
  // `order` is 1-based, so PEAKS[order] is the peak after this one.
  const nextPeak = summitedPeak ? (PEAKS[summitedPeak.order] ?? null) : null;

  return {
    summitedPeak,
    nextPeak,
    dismiss: () => setSeenCount((count) => count + 1),
  };
}
