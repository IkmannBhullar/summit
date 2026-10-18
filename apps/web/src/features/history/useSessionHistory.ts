import { FocusSessionSchema, type FocusSession } from "@summit/shared";
import { useCallback, useEffect, useState } from "react";
import { loadListFromStorage, saveToStorage } from "../../lib/storage";

const STORAGE_KEY = "sessions";

export interface SessionHistory {
  /** Every finished session, oldest first. */
  sessions: FocusSession[];
  /** Records a finished session. Adding the same session id twice is ignored. */
  addSession: (session: FocusSession) => void;
}

/**
 * The user's session history, kept in localStorage.
 *
 * In Phase 2 this becomes an API call; components only see `sessions` and
 * `addSession`, so they won't need to change.
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

  return { sessions, addSession };
}
