/**
 * Which guest sessions may be imported into an account.
 *
 * Imported history happened in a browser, so the server never saw it live
 * and can't verify it the way it checks real sessions (decision 018). These
 * rules keep fabricated history at least *physically plausible*, and every
 * imported row is flagged so features like leaderboards can leave it out.
 *
 * A pure function: no database, no clock (both passed in), easy to test.
 */
import { metersEarned, type FocusSession } from "@summit/shared";

/** Device clocks drift; allow a little "future" before calling a session impossible. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;
/** Same allowance as live completion (decision 018). */
const COMPLETION_TOLERANCE_MS = 10_000;

/** A time range something occupied, half-open: [start, end). */
export interface Interval {
  start: number;
  end: number;
}

/** Why a session was skipped (useful for tests and logs). */
export type SkipReason =
  | "UNFINISHED"
  | "ROOM_SESSION"
  | "IN_THE_FUTURE"
  | "AFTER_SIGNUP"
  | "TOO_SHORT"
  | "OVERLAPS"
  | "DUPLICATE_ID";

export interface ImportCandidateResult {
  /** Sessions to insert, with meters recalculated by the server. */
  accepted: FocusSession[];
  skipped: { id: string; reason: SkipReason }[];
}

/** True if two time ranges share any moment. Touching ends (10:25 / 10:25) don't count. */
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * @param candidates - Sessions from the guest's browser (already schema-validated).
 * @param context.accountCreatedAt - Guest history must predate the account.
 * @param context.now - Sessions can't end in the future.
 * @param context.existing - Time ranges of sessions the account already has.
 */
export function selectImportable(
  candidates: readonly FocusSession[],
  context: { accountCreatedAt: Date; now: Date; existing: readonly Interval[] },
): ImportCandidateResult {
  const accepted: FocusSession[] = [];
  const skipped: ImportCandidateResult["skipped"] = [];
  const occupied: Interval[] = [...context.existing];
  const seenIds = new Set<string>();
  const latestAllowedEnd = context.now.getTime() + CLOCK_SKEW_TOLERANCE_MS;

  // Oldest first, so when two sessions overlap, the earlier one is kept.
  const ordered = candidates.toSorted((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  for (const session of ordered) {
    const skip = (reason: SkipReason) => skipped.push({ id: session.id, reason });

    if (seenIds.has(session.id)) {
      skip("DUPLICATE_ID");
      continue;
    }
    seenIds.add(session.id);

    // Only finished solo sessions are history.
    if (
      session.endedAt === null ||
      (session.status !== "COMPLETED" && session.status !== "ABANDONED")
    ) {
      skip("UNFINISHED");
      continue;
    }
    if (session.roomId !== null) {
      skip("ROOM_SESSION");
      continue;
    }

    const interval = { start: Date.parse(session.startedAt), end: Date.parse(session.endedAt) };

    if (interval.end > latestAllowedEnd) {
      skip("IN_THE_FUTURE");
      continue;
    }
    // Guest history happened before signing up; later sessions should have
    // gone through the live, server-checked API.
    if (interval.start >= context.accountCreatedAt.getTime()) {
      skip("AFTER_SIGNUP");
      continue;
    }
    // A "completed" 25-minute session can't have lasted 3 minutes.
    if (
      session.status === "COMPLETED" &&
      interval.end - interval.start < session.plannedMinutes * 60_000 - COMPLETION_TOLERANCE_MS
    ) {
      skip("TOO_SHORT");
      continue;
    }
    // Nobody focuses on two sessions at once (this also caps a day at 24 h).
    if (occupied.some((other) => overlaps(interval, other))) {
      skip("OVERLAPS");
      continue;
    }

    occupied.push(interval);
    // Recalculate meters on the server, whatever the client said.
    accepted.push({
      ...session,
      metersGained: metersEarned(session.status, session.plannedMinutes),
    });
  }

  return { accepted, skipped };
}
