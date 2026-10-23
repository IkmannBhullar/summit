/**
 * The live connection to a rope team room, behind a small interface.
 *
 * The app uses `createSocketConnection` (Socket.io). Tests use a fake with
 * the same interface, so hooks and pages can be tested without a server.
 *
 * Everything the server sends is checked against the shared schemas, the
 * same way the REST client checks responses (see lib/api.ts).
 */
import {
  RoomStateSchema,
  type AckResult,
  type ClientToServerEvents,
  type ClockPong,
  type RoomErrorCode,
  type RoomState,
  type ServerToClientEvents,
} from "@summit/shared";
import { io, type Socket } from "socket.io-client";

/** How long to wait for the server to answer a request. */
export const REQUEST_TIMEOUT_MS = 5_000;

/** The server's error codes, plus one of ours: the request never got an answer. */
export type RoomRequestError = { code: RoomErrorCode | "NO_CONNECTION"; message: string };
export type RoomResult<T> = { ok: true; data: T } | { ok: false; error: RoomRequestError };

/** What happens on the connection, for whoever is listening. */
export type ConnectionEvent =
  /** Connected (also after an automatic reconnect): time to join the room. */
  | { type: "connected" }
  /** The connection dropped. Usually Socket.io is already trying again. */
  | { type: "disconnected"; willReconnect: boolean }
  /** The server turned the connection down, e.g. "NOT_SIGNED_IN". No retrying. */
  | { type: "refused"; reason: string }
  /** A new room snapshot. */
  | { type: "state"; state: RoomState };

export interface RoomConnection {
  /** Starts connecting. Socket.io reconnects by itself after a drop. */
  open: () => void;
  close: () => void;
  /** Listens to connection events; returns a function that stops listening. */
  subscribe: (listener: (event: ConnectionEvent) => void) => () => void;
  join: (code: string) => Promise<RoomResult<RoomState>>;
  leave: () => Promise<RoomResult<null>>;
  startSession: (plannedMinutes: number) => Promise<RoomResult<RoomState>>;
  giveUp: () => Promise<RoomResult<RoomState>>;
  /** One clock-sync round trip (see clockSync.ts). Rejects if there's no answer. */
  ping: (clientTime: number) => Promise<ClockPong>;
}

export type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * The real socket. Same origin as the page (Vite proxies /socket.io in
 * development), or VITE_API_URL if the API lives elsewhere. The browser
 * sends the login cookie with the connection, like any request to our site.
 */
export function createRoomSocket(): RoomSocket {
  const url = import.meta.env.VITE_API_URL || window.location.origin;
  const transports = parseTransports(import.meta.env.VITE_REALTIME_TRANSPORTS);
  // autoConnect: false, so nothing happens until open() is called.
  return io(url, { autoConnect: false, withCredentials: true, ...(transports && { transports }) });
}

/**
 * Reads VITE_REALTIME_TRANSPORTS ("polling", "websocket", or both, comma
 * separated). In production the browser reaches the server through Vercel's
 * rewrite, which forwards plain HTTP but not WebSockets, so it's set to
 * "polling" there. Unset: Socket.io's default (polling, upgrading to WebSocket).
 */
export function parseTransports(
  value: string | undefined,
): ("polling" | "websocket")[] | undefined {
  const transports = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is "polling" | "websocket" => part === "polling" || part === "websocket");
  return transports.length > 0 ? transports : undefined;
}

/** Turns "no answer in time" into a result, instead of an exception. */
async function request<T>(send: () => Promise<AckResult<T>>): Promise<RoomResult<T>> {
  try {
    return await send();
  } catch {
    return {
      ok: false,
      error: {
        code: "NO_CONNECTION",
        message: "Summit didn't answer. Check your connection and try again.",
      },
    };
  }
}

/** A RoomConnection over Socket.io. Tests can pass in a fake socket. */
export function createSocketConnection(socket: RoomSocket = createRoomSocket()): RoomConnection {
  // Every request gives up after REQUEST_TIMEOUT_MS (emitWithAck then rejects).
  const timed = () => socket.timeout(REQUEST_TIMEOUT_MS);

  return {
    open: () => {
      socket.connect();
    },
    close: () => {
      socket.disconnect();
    },

    subscribe(listener) {
      const onConnect = () => listener({ type: "connected" });
      // `socket.active` is false when Socket.io won't reconnect on its own:
      // after close(), or when the server disconnected us on purpose.
      const onDisconnect = () => listener({ type: "disconnected", willReconnect: socket.active });
      const onConnectError = (error: Error) => {
        // Refused by the server's sign-in check: Socket.io stops retrying
        // (active is false). Otherwise it's a network problem and it retries.
        if (!socket.active) listener({ type: "refused", reason: error.message });
        else listener({ type: "disconnected", willReconnect: true });
      };
      const onState = (state: unknown) => {
        const parsed = RoomStateSchema.safeParse(state);
        if (parsed.success) listener({ type: "state", state: parsed.data });
        // An invalid snapshot means a server bug or mismatched deploy: skip it
        // (the next valid one replaces it anyway) instead of crashing the page.
        else console.error("Ignored an invalid room snapshot", parsed.error);
      };

      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("connect_error", onConnectError);
      socket.on("room:state", onState);
      return () => {
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("connect_error", onConnectError);
        socket.off("room:state", onState);
      };
    },

    join: (code) => request(() => timed().emitWithAck("room:join", { code })),
    leave: () => request(() => timed().emitWithAck("room:leave")),
    startSession: (plannedMinutes) =>
      request(() => timed().emitWithAck("session:start", { plannedMinutes })),
    giveUp: () => request(() => timed().emitWithAck("session:give_up")),
    ping: (clientTime) => timed().emitWithAck("clock:ping", { clientTime }),
  };
}
