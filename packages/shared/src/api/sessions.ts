/**
 * Request and response shapes for the focus session API (/api/sessions...)
 * and climb progress (/api/climb).
 *
 * Notice what requests DON'T contain: meters, start times, or end times.
 * The server decides those from its own clock (see docs/decisions.md), so a
 * modified client can't claim elevation it didn't earn.
 */
import { z } from "zod";
import { ClimbProgressSchema } from "../climb";
import { FocusSessionSchema } from "../session";
import { TIMER_SETTING_LIMITS } from "../settings";
import { TagSchema } from "../tags";

/** How many sessions one history page can return, at most. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
/** How many guest sessions one import request may contain. */
export const MAX_IMPORT_SESSIONS = 1000;

/**
 * POST /api/sessions: start a focus session.
 *
 * The client creates the id (a random UUID), so the timer can start without
 * waiting for the network, and retrying the same request can't create a
 * duplicate: the id works as an "idempotency key".
 */
export const StartSessionInputSchema = z.object({
  id: z.uuid(),
  plannedMinutes: z
    .number()
    .int()
    .min(TIMER_SETTING_LIMITS.focusMinutes.min)
    .max(TIMER_SETTING_LIMITS.focusMinutes.max),
  tag: TagSchema.nullable().default(null),
});
export type StartSessionInput = z.infer<typeof StartSessionInputSchema>;

/** GET /api/tags/recent: the signed-in user's most recently used tags, newest first. */
export const RecentTagsResponseSchema = z.object({ tags: z.array(TagSchema) });
export type RecentTagsResponse = z.infer<typeof RecentTagsResponseSchema>;

/** Responses that return one session (start, complete, abandon). */
export const SessionResponseSchema = z.object({ session: FocusSessionSchema });
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * GET /api/sessions?limit=20&cursor=...: one page of history, newest first.
 *
 * Query-string values always arrive as text, so `limit` is "coerced" from a
 * string to a number before it's checked.
 */
export const ListSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** Opaque bookmark from the previous page's `nextCursor`. */
  cursor: z.string().min(1).max(200).optional(),
});
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

export const SessionPageSchema = z.object({
  sessions: z.array(FocusSessionSchema),
  /** Pass this as `cursor` to get the next (older) page; null when there are no more. */
  nextCursor: z.string().nullable(),
});
export type SessionPage = z.infer<typeof SessionPageSchema>;

/** POST /api/sessions/import: copy a guest's local history into their new account. */
export const ImportSessionsInputSchema = z.object({
  sessions: z.array(FocusSessionSchema).min(1).max(MAX_IMPORT_SESSIONS),
});
export type ImportSessionsInput = z.infer<typeof ImportSessionsInputSchema>;

export const ImportResultSchema = z.object({
  /** Sessions saved to the account. */
  imported: z.number().int().nonnegative(),
  /** Sessions ignored (already imported, unfinished, overlapping, or in the future). */
  skipped: z.number().int().nonnegative(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

/** GET /api/climb: progress derived on the server from the user's completed sessions. */
export const ClimbResponseSchema = z.object({ progress: ClimbProgressSchema });
export type ClimbResponse = z.infer<typeof ClimbResponseSchema>;
