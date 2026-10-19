/**
 * Where sessions, history, and climb progress come from:
 *
 * - Guests: this browser's localStorage (the Phase 1 behavior).
 * - Signed-in users: the server. Starting, finishing, and giving up are
 *   reported to the API, which decides the elevation (decision 018);
 *   history and climb progress are read back from it.
 *
 * Both are exposed through the same SessionStore shape, so the timer page
 * doesn't care which one it's using.
 */
import { progressFromSessions, type ClimbProgress, type FocusSession } from "@summit/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { useSessionHistory } from "../history/useSessionHistory";
import type { TimerEvent } from "../timer/timerMachine";
import {
  abandonSession,
  completeSession,
  fetchClimb,
  fetchHistoryPage,
  sessionRetryDelay,
  shouldRetrySessionRequest,
  startSession,
} from "./sessionsApi";

export interface SessionStore {
  kind: "guest" | "account";
  /** Finished sessions loaded so far, in any order. */
  sessions: FocusSession[];
  /** Climb progress; undefined while it's loading from the server. */
  progress: ClimbProgress | undefined;
  hasOlder: boolean;
  loadOlder: () => void;
  /** Feed every timer event here. */
  handleTimerEvent: (event: TimerEvent) => void;
  /** A message to show when saving to the account failed for good. */
  syncProblem: string | null;
}

/** Guests: history in localStorage, progress replayed in the browser. */
function useGuestStore(): SessionStore {
  const { sessions, addSession } = useSessionHistory();
  const progress = useMemo(() => progressFromSessions(sessions), [sessions]);

  const handleTimerEvent = useCallback(
    (event: TimerEvent) => {
      if (event.type === "focusCompleted" || event.type === "focusAbandoned") {
        addSession(event.session);
      }
    },
    [addSession],
  );

  return {
    kind: "guest",
    sessions,
    progress,
    hasOlder: false,
    loadOlder: () => {},
    handleTimerEvent,
    syncProblem: null,
  };
}

export const HISTORY_KEY = ["sessions", "history"] as const;
export const CLIMB_KEY = ["climb"] as const;

/** Signed-in users: everything goes through the API. */
function useAccountStore(enabled: boolean): SessionStore {
  const queryClient = useQueryClient();

  // History, newest first, one page at a time.
  const history = useInfiniteQuery({
    queryKey: HISTORY_KEY,
    queryFn: ({ pageParam }) => fetchHistoryPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  });
  const climb = useQuery({ queryKey: CLIMB_KEY, queryFn: fetchClimb, enabled });

  // Start requests still in flight, by session id. A completion waits for
  // its start, so the server never hears "finished" before "started".
  const pendingStarts = useRef(new Map<string, Promise<unknown>>());

  // These requests are safe to repeat (the server de-duplicates them by
  // session id), so failures that might be temporary are retried.
  const retryOptions = { retry: shouldRetrySessionRequest, retryDelay: sessionRetryDelay };

  const start = useMutation({ mutationFn: startSession, ...retryOptions });

  const finish = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      await pendingStarts.current.get(id);
      return completed ? completeSession(id) : abandonSession(id);
    },
    ...retryOptions,
    // Re-read history and progress, so the server's numbers are what's shown.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: HISTORY_KEY }),
        queryClient.invalidateQueries({ queryKey: CLIMB_KEY }),
      ]),
  });

  const { mutateAsync: startAsync } = start;
  const { mutate: finishMutate } = finish;
  const handleTimerEvent = useCallback(
    (event: TimerEvent) => {
      if (event.type === "focusStarted") {
        const request = startAsync({
          id: event.sessionId,
          plannedMinutes: event.plannedMinutes,
          tag: null,
        })
          // A failure is shown through `start.error`; here we only need
          // "settled", so the completion can go ahead (and report its own error).
          .catch(() => {})
          .finally(() => pendingStarts.current.delete(event.sessionId));
        pendingStarts.current.set(event.sessionId, request);
      } else if (event.type === "focusCompleted" || event.type === "focusAbandoned") {
        finishMutate({ id: event.session.id, completed: event.type === "focusCompleted" });
      }
    },
    [startAsync, finishMutate],
  );

  const failure = finish.error ?? start.error;
  const sessions = useMemo(
    () => history.data?.pages.flatMap((page) => page.sessions) ?? [],
    [history.data],
  );

  return {
    kind: "account",
    sessions,
    progress: climb.data,
    hasOlder: history.hasNextPage,
    loadOlder: () => void history.fetchNextPage(),
    handleTimerEvent,
    syncProblem: failure
      ? `Couldn't save your session to your account: ${failure instanceof Error ? failure.message : "unknown error"}`
      : null,
  };
}

/** The right store for who's using the app. */
export function useSessionStore(signedIn: boolean): SessionStore {
  // Hooks can't be called conditionally, so both exist; the account one
  // only fetches when someone is signed in.
  const guest = useGuestStore();
  const account = useAccountStore(signedIn);
  return signedIn ? account : guest;
}
