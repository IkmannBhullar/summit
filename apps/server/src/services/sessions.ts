/**
 * Focus sessions, with the server as the source of truth.
 *
 * The client only reports what happened ("started", "finished", "gave up").
 * The server decides everything that matters for elevation:
 * - `startedAt` comes from the SERVER's clock when the start arrives.
 * - A session can only complete once its planned minutes have really passed
 *   on the server's clock since then (minus a small network tolerance).
 * - Meters are calculated here with the shared `metersEarned`, never read
 *   from the request.
 *
 * Pauses need no special handling: they only make a session take longer,
 * so "enough time has passed" still holds.
 */
import {
  metersEarned,
  progressFromSessions,
  RECENT_TAGS_LIMIT,
  type ClimbProgress,
  type FocusSession,
  type ImportResult,
  type ListSessionsQuery,
  type SessionPage,
  type StartSessionInput,
} from "@summit/shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../db/client";
import { Prisma, type FocusSession as SessionRow } from "../generated/prisma/client";
import { HttpError } from "../lib/httpError";
import { selectImportable } from "./importRules";
import type { EndedTeamSession } from "./roomManager";

/**
 * How much earlier than its planned length a completion may arrive.
 *
 * The server records `startedAt` when the start request ARRIVES, which is a
 * little after the user clicked Start. If the start request was slower than
 * the completion request, the server measures slightly less than the real
 * time. 10 seconds absorbs that without letting anyone skip real focus time.
 */
export const COMPLETION_TOLERANCE_MS = 10_000;

const MS_PER_MINUTE = 60_000;

/** Converts a database row into the shared FocusSession shape the API returns. */
export function toSessionDto(row: SessionRow): FocusSession {
  return {
    id: row.id,
    plannedMinutes: row.plannedMinutes,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    status: row.status,
    tag: row.tag,
    metersGained: row.metersGained,
    roomId: row.roomId,
  };
}

// --- Pagination cursors -----------------------------------------------------
// History is ordered newest first by (startedAt DESC, id ASC). A cursor is the
// position of the last session on a page, encoded as base64url JSON so it's
// opaque to clients: they pass it back without needing to understand it.

const CursorSchema = z.object({ startedAt: z.iso.datetime(), id: z.uuid() });
type Cursor = z.infer<typeof CursorSchema>;

export function encodeCursor(row: Pick<SessionRow, "startedAt" | "id">): string {
  const cursor: Cursor = { startedAt: row.startedAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(text: string): Cursor {
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(text, "base64url").toString("utf8")));
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "Some fields need fixing.", {
      fields: { cursor: "Invalid cursor." },
    });
  }
}

// --- The service ------------------------------------------------------------

export interface SessionService {
  /** Starts a session. `created` is false when the same id was already started (a retry). */
  start: (
    userId: string,
    input: StartSessionInput,
  ) => Promise<{ session: FocusSession; created: boolean }>;
  complete: (userId: string, sessionId: string) => Promise<FocusSession>;
  abandon: (userId: string, sessionId: string) => Promise<FocusSession>;
  /** One page of finished sessions, newest first. */
  history: (userId: string, query: ListSessionsQuery) => Promise<SessionPage>;
  /** Climb progress, replayed from the user's completed sessions. */
  climb: (userId: string) => Promise<ClimbProgress>;
  /** The user's most recently used distinct tags, newest first. */
  recentTags: (userId: string, limit?: number) => Promise<string[]>;
  /** Copies a guest's browser history into their account (see importRules.ts). */
  importGuestHistory: (userId: string, sessions: readonly FocusSession[]) => Promise<ImportResult>;
  /** Saves a finished rope team session: one row per participant, linked to the room. */
  saveTeamSession: (ended: EndedTeamSession) => Promise<void>;
}

const notFound = () => new HttpError(404, "NOT_FOUND", "Session not found.");

/**
 * @param now - The clock. Production passes the real one; tests pass a
 *   controllable one, so "25 minutes later" is exact and instant.
 */
export function createSessionService(
  prisma: PrismaClient,
  now: () => Date = () => new Date(),
): SessionService {
  /** The user's session with this id, or 404 (also when it belongs to someone else). */
  async function findOwn(userId: string, sessionId: string): Promise<SessionRow> {
    const row = await prisma.focusSession.findFirst({ where: { id: sessionId, userId } });
    if (!row) throw notFound();
    return row;
  }

  /** A start that reuses an existing id: a retry (same user) or a clash (another user). */
  function existingStart(row: SessionRow, userId: string) {
    if (row.userId !== userId) {
      throw new HttpError(409, "CONFLICT", "That session id is already in use.");
    }
    return { session: toSessionDto(row), created: false };
  }

  return {
    async start(userId, input) {
      // Idempotency: the client chose the id, so a retried request finds it.
      const existing = await prisma.focusSession.findUnique({ where: { id: input.id } });
      if (existing) return existingStart(existing, userId);

      const startedAt = now();
      try {
        const row = await prisma.$transaction(async (tx) => {
          // Only one running session per user (the database enforces it too):
          // starting a new one gives up any session that's still running,
          // e.g. from a tab that was closed without finishing.
          await tx.focusSession.updateMany({
            where: { userId, status: "RUNNING" },
            data: { status: "ABANDONED", endedAt: startedAt, metersGained: 0 },
          });
          return tx.focusSession.create({
            data: {
              id: input.id,
              userId,
              plannedMinutes: input.plannedMinutes,
              tag: input.tag,
              startedAt,
              status: "RUNNING",
            },
          });
        });
        return { session: toSessionDto(row), created: true };
      } catch (error) {
        // Two identical starts racing each other: the second hits the
        // primary key. Treat it as the retry it is.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const raced = await prisma.focusSession.findUnique({ where: { id: input.id } });
          if (raced) return existingStart(raced, userId);
          throw new HttpError(409, "CONFLICT", "Another session was started at the same time.");
        }
        throw error;
      }
    },

    async complete(userId, sessionId) {
      const row = await findOwn(userId, sessionId);
      // Idempotent: completing twice (e.g. a retried request) changes nothing.
      if (row.status === "COMPLETED") return toSessionDto(row);
      if (row.status !== "RUNNING") {
        throw new HttpError(409, "CONFLICT", "This session was abandoned and can't be completed.");
      }

      // THE anti-cheat check: has enough real time passed, by OUR clock?
      const endedAt = now();
      const elapsedMs = endedAt.getTime() - row.startedAt.getTime();
      const requiredMs = row.plannedMinutes * MS_PER_MINUTE - COMPLETION_TOLERANCE_MS;
      if (elapsedMs < requiredMs) {
        const waitSeconds = Math.ceil((requiredMs - elapsedMs) / 1000);
        throw new HttpError(
          409,
          "SESSION_TOO_EARLY",
          `This session isn't finished yet: ${waitSeconds}s to go.`,
          { headers: { "Retry-After": String(waitSeconds) } },
        );
      }

      // Conditional update: only succeeds if it's STILL running, so two
      // simultaneous completions can't both apply.
      const { count } = await prisma.focusSession.updateMany({
        where: { id: sessionId, userId, status: "RUNNING" },
        data: {
          status: "COMPLETED",
          endedAt,
          metersGained: metersEarned("COMPLETED", row.plannedMinutes),
        },
      });
      const updated = await findOwn(userId, sessionId);
      if (count === 0 && updated.status !== "COMPLETED") {
        throw new HttpError(409, "CONFLICT", "This session was abandoned and can't be completed.");
      }
      return toSessionDto(updated);
    },

    async abandon(userId, sessionId) {
      const row = await findOwn(userId, sessionId);
      // Idempotent: giving up twice changes nothing.
      if (row.status === "ABANDONED") return toSessionDto(row);
      if (row.status === "COMPLETED") {
        throw new HttpError(409, "CONFLICT", "This session is already complete.");
      }

      await prisma.focusSession.updateMany({
        where: { id: sessionId, userId, status: "RUNNING" },
        data: { status: "ABANDONED", endedAt: now(), metersGained: 0 },
      });
      return toSessionDto(await findOwn(userId, sessionId));
    },

    async history(userId, query) {
      const after = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await prisma.focusSession.findMany({
        where: {
          userId,
          status: { in: ["COMPLETED", "ABANDONED"] },
          // "After the cursor" in our ordering: older, or the same instant
          // with a later id (ids break ties between equal timestamps).
          ...(after && {
            OR: [
              { startedAt: { lt: new Date(after.startedAt) } },
              { startedAt: new Date(after.startedAt), id: { gt: after.id } },
            ],
          }),
        },
        orderBy: [{ startedAt: "desc" }, { id: "asc" }],
        // Ask for one extra row: if it exists, there's another page.
        take: query.limit + 1,
      });

      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        sessions: page.map(toSessionDto),
        nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      };
    },

    async recentTags(userId, limit = RECENT_TAGS_LIMIT) {
      // DISTINCT ON keeps the FIRST row of each group. Grouped by lower(tag)
      // (so "aws" and "AWS" are one tag) and sorted newest first inside each
      // group, that first row is the tag's most recent use and spelling.
      // The outer query then puts those tags in newest-first order.
      // $queryRaw with a template string sends ${...} values as parameters,
      // never as SQL text, so they can't inject SQL.
      const rows = await prisma.$queryRaw<{ tag: string }[]>`
        SELECT tag FROM (
          SELECT DISTINCT ON (lower(tag)) tag, started_at
          FROM focus_sessions
          WHERE user_id = ${userId}::uuid AND tag IS NOT NULL
          ORDER BY lower(tag), started_at DESC
        ) AS latest_use
        ORDER BY started_at DESC
        LIMIT ${limit}
      `;
      return rows.map((row) => row.tag);
    },

    async climb(userId) {
      const rows = await prisma.focusSession.findMany({
        where: { userId, status: "COMPLETED" },
      });
      // The same shared, already-tested function the browser uses.
      return progressFromSessions(rows.map(toSessionDto));
    },

    async importGuestHistory(userId, sessions) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });
      if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");

      // Ids already in the database (imported before, or anyone else's) are
      // skipped without saying whose they are.
      const taken = await prisma.focusSession.findMany({
        where: { id: { in: sessions.map((session) => session.id) } },
        select: { id: true },
      });
      const takenIds = new Set(taken.map((row) => row.id));
      const fresh = sessions.filter((session) => !takenIds.has(session.id));

      // The account's existing sessions, so imports can't overlap them.
      const currentTime = now();
      const existing = await prisma.focusSession.findMany({
        where: { userId },
        select: { startedAt: true, endedAt: true },
      });
      const { accepted } = selectImportable(fresh, {
        accountCreatedAt: user.createdAt,
        now: currentTime,
        existing: existing.map((row) => ({
          start: row.startedAt.getTime(),
          // A running session occupies time up to now.
          end: (row.endedAt ?? currentTime).getTime(),
        })),
      });

      // One INSERT for the whole batch. skipDuplicates covers the rare race
      // where the same import is sent twice at the same moment.
      const { count } = await prisma.focusSession.createMany({
        data: accepted.map((session) => ({
          id: session.id,
          userId,
          plannedMinutes: session.plannedMinutes,
          startedAt: new Date(session.startedAt),
          endedAt: session.endedAt === null ? null : new Date(session.endedAt),
          status: session.status,
          tag: session.tag,
          metersGained: session.metersGained, // already recalculated by selectImportable
          imported: true,
        })),
        skipDuplicates: true,
      });

      return { imported: count, skipped: sessions.length - count };
    },

    async saveTeamSession(ended) {
      // Someone may have deleted their account (or the host's, deleting the
      // room) mid-session. Save everyone who still exists, instead of letting
      // one missing row fail the whole insert.
      const [users, room] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: ended.participantIds } }, select: { id: true } }),
        prisma.room.findUnique({ where: { id: ended.roomId }, select: { id: true } }),
      ]);

      // The times come from the room manager (the server's clock), so these
      // rows pass the same checks as a solo session: no client says "done".
      await prisma.focusSession.createMany({
        data: users.map(({ id: userId }) => ({
          // Each member's row gets its own id; the team session id is only live state.
          id: randomUUID(),
          userId,
          plannedMinutes: ended.plannedMinutes,
          startedAt: ended.startedAt,
          endedAt: ended.endedAt,
          status: ended.status,
          metersGained: metersEarned(ended.status, ended.plannedMinutes),
          roomId: room?.id ?? null,
        })),
      });
    },
  };
}
