/** The session endpoints, as typed functions (signed-in users only). */
import {
  ClimbResponseSchema,
  ImportResultSchema,
  RecentTagsResponseSchema,
  MAX_IMPORT_SESSIONS,
  SessionPageSchema,
  SessionResponseSchema,
  type ClimbProgress,
  type FocusSession,
  type ImportResult,
  type SessionPage,
  type StartSessionInput,
} from "@summit/shared";
import { apiRequest } from "../../lib/api";

export async function startSession(input: StartSessionInput): Promise<FocusSession> {
  const { session } = await apiRequest("/api/sessions", {
    method: "POST",
    body: input,
    schema: SessionResponseSchema,
  });
  return session;
}

export async function completeSession(id: string): Promise<FocusSession> {
  const { session } = await apiRequest(`/api/sessions/${id}/complete`, {
    method: "POST",
    schema: SessionResponseSchema,
  });
  return session;
}

export async function abandonSession(id: string): Promise<FocusSession> {
  const { session } = await apiRequest(`/api/sessions/${id}/abandon`, {
    method: "POST",
    schema: SessionResponseSchema,
  });
  return session;
}

export function fetchHistoryPage(cursor: string | null, limit = 50): Promise<SessionPage> {
  const query = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
  return apiRequest(`/api/sessions?${query}`, { schema: SessionPageSchema });
}

/** Sessions finished while the server couldn't be reached (from the outbox). */
export function saveOfflineSessions(sessions: readonly FocusSession[]): Promise<ImportResult> {
  return apiRequest("/api/sessions/offline", {
    method: "POST",
    body: { sessions },
    schema: ImportResultSchema,
  });
}

export async function fetchRecentTags(): Promise<string[]> {
  const { tags } = await apiRequest("/api/tags/recent", { schema: RecentTagsResponseSchema });
  return tags;
}

export async function fetchClimb(): Promise<ClimbProgress> {
  const { progress } = await apiRequest("/api/climb", { schema: ClimbResponseSchema });
  return progress;
}

/**
 * Imports guest sessions into the account, in batches the server accepts
 * (at most MAX_IMPORT_SESSIONS per request), and adds up the results.
 */
export async function importSessions(sessions: readonly FocusSession[]): Promise<ImportResult> {
  const total: ImportResult = { imported: 0, skipped: 0 };
  for (let start = 0; start < sessions.length; start += MAX_IMPORT_SESSIONS) {
    const result = await apiRequest("/api/sessions/import", {
      method: "POST",
      body: { sessions: sessions.slice(start, start + MAX_IMPORT_SESSIONS) },
      schema: ImportResultSchema,
    });
    total.imported += result.imported;
    total.skipped += result.skipped;
  }
  return total;
}
