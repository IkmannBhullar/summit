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
import {
  progressFromSessions,
  recentTags,
  type ClimbProgress,
  type FocusSession,
} from "@summit/shared";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSessionHistory, type SessionHistory } from "../history/useSessionHistory";
import { isServerUnreachable } from "../auth/useAuth";
import { STATS_KEY } from "../stats/useStats";
import type { TimerEvent } from "../timer/timerMachine";
import {
  abandonSession,
  completeSession,
  fetchClimb,
  fetchHistoryPage,
  fetchRecentTags,
  saveOfflineSessions,
  startSession,
} from "./sessionsApi";
import { SessionOutbox, type OutboxState } from "./outbox";

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
  /** Finished sessions saved on this device, waiting to reach the account. */
  waitingToSync: number;
  /** The account's climb or history couldn't be loaded: the server can't be reached. */
  offline: boolean;
  /** Recently used tags, newest first, for the tag picker. */
  recentTags: string[];
}

/** Guests: history in localStorage, progress replayed in the browser. */
function useGuestStore(guestHistory: SessionHistory): SessionStore {
  const { sessions, addSession } = guestHistory;
  const progress = useMemo(() => progressFromSessions(sessions), [sessions]);
  const tags = useMemo(() => recentTags(sessions), [sessions]);

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
    waitingToSync: 0,
    offline: false,
    recentTags: tags,
  };
}

export const HISTORY_KEY = ["sessions", "history"] as const;
export const CLIMB_KEY = ["climb"] as const;
export const RECENT_TAGS_KEY = ["tags", "recent"] as const;

/** Nothing waiting: used when there's no outbox (guests). */
const NO_OUTBOX: OutboxState = { waiting: 0, problem: null };
const subscribeToNothing = () => () => {};
const noOutboxState = () => NO_OUTBOX;

/**
 * Signed-in users: history and climb come from the API, and every save goes
 * through this account's outbox, so it survives being offline and reloads.
 *
 * @param userId - The signed-in user, or null (then this store isn't used).
 *   The timer page remounts when the user changes, so this is fixed for the
 *   store's life.
 */
function useAccountStore(userId: string | null): SessionStore {
  const enabled = userId !== null;
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
  const tags = useQuery({ queryKey: RECENT_TAGS_KEY, queryFn: fetchRecentTags, enabled });

  // One outbox per account, saved under its id, so someone else signing in
  // on this device never sends your sessions. (useState's initializer runs
  // once, so there's exactly one outbox for this store's life.)
  const [outbox] = useState(() =>
    userId === null
      ? null
      : new SessionOutbox({
          storageKey: `outbox:${userId}`,
          api: {
            start: startSession,
            complete: completeSession,
            abandon: abandonSession,
            saveOffline: saveOfflineSessions,
          },
          // A saved session changes all of these: show the server's numbers.
          onSessionSaved: () => {
            for (const queryKey of [HISTORY_KEY, CLIMB_KEY, RECENT_TAGS_KEY, STATS_KEY]) {
              void queryClient.invalidateQueries({ queryKey });
            }
          },
        }),
  );

  // Send whatever is waiting now, and again whenever the browser is back online.
  useEffect(() => {
    if (!outbox) return;
    outbox.start();
    const onOnline = () => outbox.retryNow();
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      outbox.stop();
    };
  }, [outbox]);

  // Re-render when the outbox's waiting count or problem changes.
  const outboxState = useSyncExternalStore(
    outbox?.subscribe ?? subscribeToNothing,
    outbox?.getState ?? noOutboxState,
  );

  const handleTimerEvent = useCallback(
    (event: TimerEvent) => {
      if (!outbox) return;
      if (event.type === "focusStarted") {
        outbox.enqueueStart({
          id: event.sessionId,
          plannedMinutes: event.plannedMinutes,
          tag: event.tag,
        });
      } else if (event.type === "focusCompleted" || event.type === "focusAbandoned") {
        outbox.enqueueFinish(event.session);
      }
    },
    [outbox],
  );

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
    syncProblem: outboxState.problem,
    waitingToSync: outboxState.waiting,
    offline: [climb, history].some((query) => query.isError && isServerUnreachable(query.error)),
    recentTags: tags.data ?? [],
  };
}

/**
 * The right store for who's using the app, plus this device's guest history
 * (so a signed-in user can import it, see useGuestImport).
 *
 * There's exactly ONE guest-history instance: two copies of the hook would
 * each keep their own state, and clearing one could be undone when the
 * other saved its stale copy back to storage.
 */
export function useSessionStore(userId: string | null): {
  store: SessionStore;
  guestHistory: SessionHistory;
} {
  const guestHistory = useSessionHistory();
  // Hooks can't be called conditionally, so both exist; the account one
  // only fetches when someone is signed in.
  const guest = useGuestStore(guestHistory);
  const account = useAccountStore(userId);
  return { store: userId !== null ? account : guest, guestHistory };
}
