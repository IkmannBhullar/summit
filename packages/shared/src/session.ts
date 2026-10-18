/**
 * Focus sessions: one record per focus period a user starts.
 * Breaks are never stored as sessions (see CLAUDE.md).
 */
import { z } from "zod";
import { metersForFocusMinutes } from "./elevation";
import { TIMER_SETTING_LIMITS } from "./settings";

/**
 * Session lifecycle: PLANNED → RUNNING → COMPLETED | ABANDONED.
 * COMPLETED and ABANDONED are "finished" states and never change again.
 */
export const SessionStatusSchema = z.enum(["PLANNED", "RUNNING", "COMPLETED", "ABANDONED"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** Statuses a session can end in. */
const FINISHED_STATUSES: readonly SessionStatus[] = ["COMPLETED", "ABANDONED"];

/**
 * A focus session. Mirrors the future `FocusSession` database table, minus
 * `userId` (the server adds that from the logged-in user in Phase 2).
 */
export const FocusSessionSchema = z
  .object({
    /** Random UUID, created on the device. Lets Phase 2 import local history without duplicates. */
    id: z.uuid(),
    plannedMinutes: z
      .number()
      .int()
      .min(TIMER_SETTING_LIMITS.focusMinutes.min)
      .max(TIMER_SETTING_LIMITS.focusMinutes.max),
    startedAt: z.iso.datetime(),
    /** When it finished; null while it's still planned or running. */
    endedAt: z.iso.datetime().nullable(),
    status: SessionStatusSchema,
    /** Optional label like "LeetCode" (tags arrive in Phase 4). */
    tag: z.string().trim().min(1).max(32).nullable(),
    metersGained: z.number().int().nonnegative(),
    /** Set for rope team sessions (Phase 3); null for solo sessions. */
    roomId: z.string().nullable(),
  })
  // Rules that involve more than one field. Each problem is reported on the
  // field it concerns, so a form could show the error in the right place.
  .superRefine((session, ctx) => {
    const finished = FINISHED_STATUSES.includes(session.status);

    if (finished && session.endedAt === null) {
      ctx.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "A finished session needs endedAt",
      });
    }
    if (session.endedAt !== null && Date.parse(session.endedAt) < Date.parse(session.startedAt)) {
      ctx.addIssue({ code: "custom", path: ["endedAt"], message: "endedAt is before startedAt" });
    }
    if (session.metersGained !== metersEarned(session.status, session.plannedMinutes)) {
      ctx.addIssue({
        code: "custom",
        path: ["metersGained"],
        message: "metersGained doesn't match the session's status and length",
      });
    }
  });
export type FocusSession = z.infer<typeof FocusSessionSchema>;

/**
 * Elevation a session is worth.
 *
 * Only a COMPLETED session earns meters (its full planned length). An
 * abandoned session earns nothing: "you slid back down". Sessions that
 * haven't finished yet haven't earned anything *yet*.
 */
export function metersEarned(status: SessionStatus, plannedMinutes: number): number {
  return status === "COMPLETED" ? metersForFocusMinutes(plannedMinutes) : 0;
}
