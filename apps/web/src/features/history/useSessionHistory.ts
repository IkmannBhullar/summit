import { FocusSessionSchema, type FocusSession } from "@summit/shared";
import { useCallback, useEffect, useState } from "react";
import { loadListFromStorage, saveToStorage } from "../../lib/storage";

const STORAGE_KEY = "sessions";

export interface SessionHistory {
  /** Every finished session, oldest first. */
  sessions: FocusSession[];
  /** Records a finished session. Adding the same session id twice is ignored. */
  addSession: (session: FocusSession) => void;
  /** Forgets every session (e.g. after importing them into an account). */
  clear: () => void;
}

/**
 * A guest's session history, kept in this browser's localStorage.
 * (Signed-in users' history comes from the API; see useSessionStore.)
 */
export function useSessionHistory(): SessionHistory {
  // Read storage once, on the first render. Invalid entries are dropped
  // individually, so one corrupted session can't erase the rest.
  const [sessions, setSessions] = useState(() =>
    loadListFromStorage(STORAGE_KEY, FocusSessionSchema),
  );

  // Save whenever the list changes. Doing it in an effect (not inside the
  // setSessions updater) keeps the updater pure; React may call updaters
  // twice in development.
  useEffect(() => {
    saveToStorage(STORAGE_KEY, sessions);
  }, [sessions]);

  const addSession = useCallback((session: FocusSession) => {
    setSessions((previous) =>
      // Idempotent: if this session is somehow reported twice, keep one copy.
      previous.some((existing) => existing.id === session.id) ? previous : [...previous, session],
    );
  }, []);

  const clear = useCallback(() => setSessions([]), []);

  return { sessions, addSession, clear };
}
