/**
 * Being in a rope team room, for React components.
 *
 *   const room = useRoom("K7QM2X");
 *   room.status      "connecting" | "in_room" | "reconnecting" | "failed" | "left"
 *   room.room        the latest RoomState snapshot from the server
 *   room.offsetMs    this device's clock offset (serverNow = Date.now() + offsetMs)
 *   room.startSession(25), room.giveUp(), room.leave()
 *
 * Joining happens on every (re)connect. After a dropped connection,
 * Socket.io reconnects by itself and we join again, which the server
 * treats as "back within the grace period".
 *
 * Give the component using this `key={code}`, so a different room starts
 * from a fresh state.
 */
import type { RoomState } from "@summit/shared";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { measureClockOffset } from "./clockSync";
import {
  createSocketConnection,
  type RoomConnection,
  type RoomRequestError,
  type RoomResult,
} from "./roomConnection";

/**
 * Makes the connection a room page uses. The app gets real sockets by
 * default; tests wrap components in a provider that hands out a fake.
 */
export const RoomConnectionContext = createContext<() => RoomConnection>(() =>
  createSocketConnection(),
);

export type RoomStatus = "connecting" | "in_room" | "reconnecting" | "failed" | "left";

export interface UseRoomResult {
  status: RoomStatus;
  /** Kept while reconnecting, so the page doesn't go blank during a blip. */
  room: RoomState | null;
  /** Why we couldn't join or stay (when status is "failed"). */
  problem: RoomRequestError | { code: "NOT_SIGNED_IN" | "DISCONNECTED"; message: string } | null;
  /** Add to Date.now() to get the server's time. 0 until measured. */
  offsetMs: number;
  startSession: (plannedMinutes: number) => Promise<RoomResult<RoomState>>;
  giveUp: () => Promise<RoomResult<RoomState>>;
  leave: () => Promise<RoomResult<null>>;
}

const NO_CONNECTION: RoomResult<never> = {
  ok: false,
  error: { code: "NO_CONNECTION", message: "Not connected to the room." },
};

/** A refusal from the server's sign-in check, in words for the page. */
function refusalProblem(reason: string): NonNullable<UseRoomResult["problem"]> {
  return reason === "NOT_SIGNED_IN"
    ? { code: "NOT_SIGNED_IN", message: "Sign in to join a rope team." }
    : { code: "NO_CONNECTION", message: "Can't connect to Summit right now. Try again soon." };
}

export function useRoom(code: string): UseRoomResult {
  const createConnection = useContext(RoomConnectionContext);
  // The current connection, for the action functions below. A ref, not
  // state: changing it shouldn't re-render, and actions read it when called.
  const connectionRef = useRef<RoomConnection | null>(null);
  // True once WE close the connection (after leaving, or a failed join).
  // Socket.io still reports that as a "disconnect", which isn't a problem.
  const closedOnPurposeRef = useRef(false);

  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [problem, setProblem] = useState<UseRoomResult["problem"]>(null);
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    const connection = createConnection();
    connectionRef.current = connection;
    closedOnPurposeRef.current = false;
    // Set by the cleanup: answers that arrive after unmounting are ignored.
    let disposed = false;

    /** On every connect: join the room, then measure the clock. */
    async function joinAndSync() {
      const result = await connection.join(code);
      if (disposed) return;
      if (!result.ok) {
        // Room not found, full, already in another room...: stop trying.
        setProblem(result.error);
        setStatus("failed");
        closedOnPurposeRef.current = true;
        connection.close();
        return;
      }
      setRoom(result.data);
      setProblem(null);
      setStatus("in_room");

      try {
        const estimate = await measureClockOffset(connection.ping);
        if (!disposed) setOffsetMs(estimate.offsetMs);
      } catch {
        // No answer: keep the previous estimate; the next reconnect retries.
      }
    }

    const unsubscribe = connection.subscribe((event) => {
      switch (event.type) {
        case "connected":
          void joinAndSync();
          break;
        case "state":
          setRoom(event.state);
          break;
        case "disconnected":
          if (closedOnPurposeRef.current) break;
          if (event.willReconnect) {
            setStatus("reconnecting");
          } else {
            setProblem({ code: "DISCONNECTED", message: "You were disconnected from the room." });
            setStatus("failed");
          }
          break;
        case "refused":
          setProblem(refusalProblem(event.reason));
          setStatus("failed");
          break;
      }
    });
    connection.open();

    // Leaving the page without pressing Leave works like closing the tab:
    // the server gives a short grace period, in case we come right back.
    return () => {
      disposed = true;
      closedOnPurposeRef.current = true;
      unsubscribe();
      connection.close();
      connectionRef.current = null;
    };
  }, [code, createConnection]);

  /** Sends a request, and shows the room it returns straight away. */
  const send = useCallback(
    async (call: (connection: RoomConnection) => Promise<RoomResult<RoomState>>) => {
      const connection = connectionRef.current;
      if (!connection) return NO_CONNECTION;
      const result = await call(connection);
      if (result.ok) setRoom(result.data);
      return result;
    },
    [],
  );

  const startSession = useCallback(
    (plannedMinutes: number) => send((connection) => connection.startSession(plannedMinutes)),
    [send],
  );
  const giveUp = useCallback(() => send((connection) => connection.giveUp()), [send]);

  const leave = useCallback(async () => {
    const connection = connectionRef.current;
    if (!connection) return NO_CONNECTION;
    const result = await connection.leave();
    if (result.ok) {
      setStatus("left");
      closedOnPurposeRef.current = true;
      connection.close();
    }
    return result;
  }, []);

  return { status, room, problem, offsetMs, startSession, giveUp, leave };
}
