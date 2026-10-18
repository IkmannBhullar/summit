/**
 * Rebuilds climb progress from session history.
 *
 * Progress isn't stored separately: it's what you get by replaying every
 * completed session, oldest first, through `applyMeters`. One source of
 * truth (the sessions) means progress can never disagree with history.
 * (See docs/decisions.md, entry 011.)
 */
import { applyMeters, createInitialProgress, type ClimbProgress } from "./climb";
import { PEAKS, type Peak } from "./peaks";
import type { FocusSession } from "./session";

/**
 * Replays completed sessions into climb progress.
 *
 * Sessions may arrive in any order; they're applied by when they ended, and
 * each summit is timestamped with the `endedAt` of the session that reached it.
 * Abandoned and unfinished sessions earn nothing and are skipped.
 */
export function progressFromSessions(
  sessions: readonly FocusSession[],
  peaks: readonly Peak[] = PEAKS,
): ClimbProgress {
  const completed = sessions
    .filter(
      (session): session is FocusSession & { endedAt: string } =>
        session.status === "COMPLETED" && session.endedAt !== null,
    )
    // toSorted returns a sorted copy (plain .sort() would rearrange in place).
    .toSorted((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt));

  let progress = createInitialProgress(peaks);
  for (const session of completed) {
    progress = applyMeters(
      progress,
      session.metersGained,
      new Date(session.endedAt),
      peaks,
    ).progress;
  }
  return progress;
}
