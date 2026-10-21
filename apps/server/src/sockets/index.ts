/**
 * The real-time server: Socket.io running on the same HTTP server as Express.
 *
 * This file is the "glue" between the network and the RoomManager:
 *
 *   browser ──event──► here: check who they are, validate the payload
 *                        │
 *                        ▼
 *                   RoomManager (all the room rules)
 *                        │ events
 *                        ▼
 *   here: broadcast snapshots, save finished sessions, update the rooms table
 *
 * Socket.io "rooms" (broadcast groups) are used two ways:
 *   room:<id>  every connection in a rope team room, to broadcast its state
 *   user:<id>  every tab of one user, so they can all be moved at once
 */
import {
  ClockPingPayloadSchema,
  JoinRoomPayloadSchema,
  StartTeamSessionPayloadSchema,
  type AckResult,
  type ClientToServerEvents,
  type ClimbProgress,
  type RoomMember,
  type ServerToClientEvents,
} from "@summit/shared";
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { Config } from "../config/env";
import type { PrismaClient } from "../db/client";
import {
  RoomManager,
  systemClock,
  type Clock,
  type EndedTeamSession,
  type Schedule,
} from "../services/roomManager";
import { createRoomService } from "../services/rooms";
import { createSessionService } from "../services/sessions";
import { createTokenService, SESSION_COOKIE } from "../services/tokens";

/** What we remember about each connection after it signs in. */
interface SocketData {
  userId: string;
  displayName: string;
}

// The shared event interfaces make every emit and handler type-checked.
type IoServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

export interface RealtimeDependencies {
  config: Config;
  prisma: PrismaClient;
  /** Tests pass a ManualClock for both of these. */
  clock?: Clock;
  schedule?: Schedule;
  /** Where errors from background work go. Defaults to console.error. */
  onError?: (error: unknown) => void;
}

export interface RealtimeServer {
  io: IoServer;
  /** Resolves once background work (saving sessions, updating rooms) has finished. */
  whenIdle: () => Promise<void>;
  /** Disconnects everyone, stops the HTTP server, and waits for background work. */
  close: () => Promise<void>;
}

const roomChannel = (roomId: string) => `room:${roomId}`;
const userChannel = (userId: string) => `user:${userId}`;

const fail = <T>(code: "INVALID_REQUEST" | "ROOM_NOT_FOUND" | "SERVER_ERROR", message: string) =>
  ({ ok: false, error: { code, message } }) as AckResult<T>;
const invalid = <T>() => fail<T>("INVALID_REQUEST", "That request wasn't valid.");

/**
 * Reads one cookie from a Cookie header ("theme=dark; summit_session=abc").
 * Socket.io doesn't run Express middleware, so it can't use cookie-parser.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return undefined; // Malformed escape: treat as no cookie.
    }
  }
  return undefined;
}

/** What the team mountain shows for a member: their current peak and meters on it. */
function memberClimb(progress: ClimbProgress): RoomMember["climb"] {
  // The last climb is the current one (there's always at least one).
  const current = progress.climbs.at(-1);
  if (!current) throw new Error("Climb progress has no climbs");
  return { peakId: current.peakId, metersGained: current.metersGained };
}

/** Calls the client's acknowledgement if it sent one (a hand-made client might not). */
function reply<T>(ack: unknown, result: T): void {
  if (typeof ack === "function") (ack as (result: T) => void)(result);
}

export function createRealtimeServer(
  httpServer: HttpServer,
  deps: RealtimeDependencies,
): RealtimeServer {
  const { config, prisma } = deps;
  const clock = deps.clock ?? systemClock;
  const now = () => new Date(clock.now());
  const onError = deps.onError ?? ((error: unknown) => console.error("Realtime error:", error));
  const tokens = createTokenService(config.jwtSecret);
  const rooms = createRoomService(prisma, { now });
  const sessions = createSessionService(prisma, now);

  // --- Background work ------------------------------------------------------
  // Room events arrive synchronously, but saving is async. Track the promises
  // so tests (and shutdown) can wait for them, and log any failure.
  const pending = new Set<Promise<unknown>>();
  function background(work: Promise<unknown>): void {
    const tracked = work.catch(onError).finally(() => pending.delete(tracked));
    pending.add(tracked);
  }
  const whenIdle = async () => {
    while (pending.size > 0) await Promise.all(pending);
  };

  /** Rooms whose "closed" write is in flight: joining them now would revive a dead room. */
  const closing = new Set<string>();

  const io: IoServer = new Server(httpServer, {
    // The browser library is installed with npm, not served from here.
    serveClient: false,
    // Defense against cross-site WebSocket hijacking: browsers always send
    // an Origin header, so refuse connections started by any other website.
    // (No Origin means a non-browser client, which can't carry a user's cookies.)
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, origin === undefined || origin === config.webOrigin);
    },
  });

  const manager = new RoomManager({
    clock,
    ...(deps.schedule && { schedule: deps.schedule }),
    notify: (event) => {
      switch (event.type) {
        case "state":
          io.to(roomChannel(event.roomId)).emit("room:state", event.state);
          break;
        case "session_ended":
          background(saveTeamSession(event.session));
          break;
        case "host_changed":
          background(rooms.setHost(event.roomId, event.hostId));
          break;
        case "closed":
          closing.add(event.roomId);
          background(rooms.close(event.roomId).finally(() => closing.delete(event.roomId)));
          break;
      }
    },
  });

  /** Saves everyone's session; after a success, shows their new elevation. */
  async function saveTeamSession(ended: EndedTeamSession): Promise<void> {
    await sessions.saveTeamSession(ended);
    if (ended.status !== "COMPLETED") return; // An abandoned session earns nothing.
    for (const userId of ended.participantIds) {
      manager.setClimb(userId, memberClimb(await sessions.climb(userId)));
    }
  }

  // --- Sign-in --------------------------------------------------------------
  // Runs once per connection, before any event: the same login cookie as the
  // REST API. A rejected connection gets a "connect_error" with this message.
  io.use((socket, next) => {
    const signIn = async () => {
      const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      const userId = token ? await tokens.verify(token) : null;
      const user = userId
        ? await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } })
        : null;
      if (!userId || !user) return next(new Error("NOT_SIGNED_IN"));
      socket.data.userId = userId;
      socket.data.displayName = user.displayName;
      next();
    };
    signIn().catch((error: unknown) => {
      onError(error);
      next(new Error("SERVER_ERROR"));
    });
  });

  io.on("connection", (socket) => handleConnection(socket));

  /**
   * Runs a request handler and sends its result to the acknowledgement.
   * Unexpected errors become SERVER_ERROR instead of leaving the client waiting.
   */
  function handle<T>(ack: unknown, work: () => AckResult<T> | Promise<AckResult<T>>): void {
    Promise.resolve()
      .then(work)
      .then(
        (result) => reply(ack, result),
        (error: unknown) => {
          onError(error);
          reply(ack, fail<T>("SERVER_ERROR", "Something went wrong. Try again."));
        },
      );
  }

  function handleConnection(socket: IoSocket): void {
    const { userId, displayName } = socket.data;
    void socket.join(userChannel(userId));

    // Payloads are typed `unknown` on purpose: they come from a browser, so
    // they're validated with the shared schemas before use.
    socket.on("room:join", (payload: unknown, ack: unknown) => {
      handle(ack, async () => {
        const parsed = JoinRoomPayloadSchema.safeParse(payload);
        if (!parsed.success) return invalid();

        const stored = await rooms.findOpenByCode(parsed.data.code);
        if (!stored || closing.has(stored.id)) {
          return fail("ROOM_NOT_FOUND", "There's no open room with that code.");
        }
        const climb = memberClimb(await sessions.climb(userId));
        // The tab may have closed while we were reading the database. Joining
        // now would add a connection that never disconnects.
        if (socket.disconnected) return fail("SERVER_ERROR", "Disconnected while joining.");

        const result = manager.join(stored, { userId, displayName, climb }, socket.id);
        if (!result.ok) return result;

        await socket.join(roomChannel(stored.id));
        // The creator is host in the database; if someone else got there
        // first and became host, record that.
        const host = result.data.members.find((member) => member.isHost);
        if (host && host.userId !== stored.hostId) {
          background(rooms.setHost(stored.id, host.userId));
        }
        return result;
      });
    });

    socket.on("room:leave", (ack: unknown) => {
      handle(ack, () => {
        // Take all of this user's tabs out of the broadcast group first, so
        // they don't get the snapshot of a room they've left.
        const roomId = manager.roomIdOf(userId);
        if (roomId) io.in(userChannel(userId)).socketsLeave(roomChannel(roomId));
        return manager.leave(userId);
      });
    });

    socket.on("session:start", (payload: unknown, ack: unknown) => {
      handle(ack, () => {
        const parsed = StartTeamSessionPayloadSchema.safeParse(payload);
        if (!parsed.success) return invalid();
        return manager.startSession(userId, parsed.data.plannedMinutes);
      });
    });

    socket.on("session:give_up", (ack: unknown) => {
      handle(ack, () => manager.giveUp(userId));
    });

    // Clock sync: answer as fast as possible with our time (see shared clock.ts).
    socket.on("clock:ping", (payload: unknown, ack: unknown) => {
      const parsed = ClockPingPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      reply(ack, { clientTime: parsed.data.clientTime, serverTime: clock.now() });
    });

    // Fires for every connection that ends, for any reason.
    socket.on("disconnect", () => manager.disconnect(socket.id));
  }

  return {
    io,
    whenIdle,
    async close() {
      // Also closes the HTTP server. Running team sessions end without being
      // saved (live state is in memory; see docs/decisions.md).
      await io.close();
      await whenIdle();
    },
  };
}
