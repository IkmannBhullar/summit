// Integration tests for the real-time server: a real HTTP + Socket.io server
// on a random port, real socket.io-client connections with real login
// cookies, and the real test database. Only time is fake (ManualClock).
import {
  RECONNECT_GRACE_MS,
  RoomResponseSchema,
  START_COUNTDOWN_MS,
  type AckResult,
  type ClientToServerEvents,
  type RoomState,
  type ServerToClientEvents,
} from "@summit/shared";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { testConfig } from "../test/config";
import { createTestPrisma, resetDatabase } from "../test/db";
import { ManualClock } from "../test/manualClock";
import { createRealtimeServer, readCookie, type RealtimeServer } from "./index";

const prisma = createTestPrisma();
const MINUTE = 60_000;

type TypedClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

// --- A running server per test ---------------------------------------------

let clock: ManualClock;
let realtime: RealtimeServer;
let baseUrl: string;
let clients: TypedClient[];
let backgroundErrors: unknown[];

beforeEach(async () => {
  await resetDatabase(prisma);
  clock = new ManualClock("2026-10-19T09:00:00.000Z");
  clients = [];
  backgroundErrors = [];
  const app = createApp({
    config: testConfig,
    prisma,
    authRateLimit: { windowMs: 60_000, limit: 1000 },
    now: () => new Date(clock.now()),
  });
  const httpServer = createServer(app);
  realtime = createRealtimeServer(httpServer, {
    config: testConfig,
    prisma,
    clock,
    schedule: clock.schedule,
    onError: (error) => backgroundErrors.push(error),
  });
  // Port 0: the operating system picks any free port.
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  baseUrl = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of clients) client.disconnect();
  await realtime.close();
  // Background work must never have failed silently.
  expect(backgroundErrors).toEqual([]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// --- Helpers ----------------------------------------------------------------

/** Registers a user over HTTP and returns their login cookie and id. */
async function register(displayName: string) {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `${displayName.toLowerCase()}@example.com`,
      password: "correct horse battery",
      displayName,
    }),
  });
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("summit_session="));
  if (!setCookie) throw new Error("no login cookie");
  const { user } = (await res.json()) as { user: { id: string } };
  return { cookie: setCookie.split(";")[0] ?? "", userId: user.id };
}

/** Creates a room over HTTP as this user. */
async function createRoom(cookie: string) {
  const res = await fetch(`${baseUrl}/api/rooms`, { method: "POST", headers: { cookie } });
  return RoomResponseSchema.parse(await res.json()).room.code;
}

/**
 * A connected client that records every room snapshot it receives, so a
 * test can wait for "the next state where X is true" without races.
 */
async function connectAs(cookie: string | null, headers: Record<string, string> = {}) {
  const socket: TypedClient = connect(baseUrl, {
    // Straight to WebSockets (no HTTP long-polling first), one fresh
    // connection per client, and no automatic reconnecting.
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    extraHeaders: { ...(cookie && { cookie }), ...headers },
  });
  clients.push(socket);
  const states: RoomState[] = [];
  const waiters: { match: (s: RoomState) => boolean; resolve: (s: RoomState) => void }[] = [];
  socket.on("room:state", (state) => {
    states.push(state);
    for (const waiter of waiters.filter((w) => w.match(state))) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(state);
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });

  return {
    socket,
    states,
    /** The latest snapshot if it matches, otherwise the next one that does. */
    waitForState(match: (s: RoomState) => boolean, timeoutMs = 2000): Promise<RoomState> {
      const latest = states.at(-1);
      if (latest && match(latest)) return Promise.resolve(latest);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out waiting for state")), timeoutMs);
        waiters.push({
          match,
          resolve: (state) => {
            clearTimeout(timer);
            resolve(state);
          },
        });
      });
    },
  };
}

/** Connection errors come back as the Error message the server's middleware used. */
async function connectionError(cookie: string | null, headers: Record<string, string> = {}) {
  try {
    await connectAs(cookie, headers);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the connection to be refused");
}

const unwrap = <T>(result: AckResult<T>): T => {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
};
const statuses = (state: RoomState) =>
  Object.fromEntries(state.members.map((m) => [m.displayName, m.status]));

/** Ana creates a room and both Ana and Ben join it. */
async function anaAndBenInARoom() {
  const anaUser = await register("Ana");
  const benUser = await register("Ben");
  const code = await createRoom(anaUser.cookie);
  const ana = await connectAs(anaUser.cookie);
  const ben = await connectAs(benUser.cookie);
  unwrap(await ana.socket.emitWithAck("room:join", { code }));
  unwrap(await ben.socket.emitWithAck("room:join", { code }));
  await ana.waitForState((s) => s.members.length === 2);
  const room = await prisma.room.findFirstOrThrow({ where: { code } });
  return { ana, ben, anaUser, benUser, code, roomId: room.id };
}

/** Starts 25 minutes as Ana (the host) and waits until both see it. */
async function startTeamSession(t: Awaited<ReturnType<typeof anaAndBenInARoom>>) {
  unwrap(await t.ana.socket.emitWithAck("session:start", { plannedMinutes: 25 }));
  await t.ben.waitForState((s) => s.phase.kind === "focus");
}

// --- Tests ------------------------------------------------------------------

describe("readCookie", () => {
  it("finds one cookie among several, and ignores the rest", () => {
    expect(readCookie("theme=dark; summit_session=abc.def; x=1", "summit_session")).toBe("abc.def");
    expect(readCookie("theme=dark", "summit_session")).toBeUndefined();
    expect(readCookie(undefined, "summit_session")).toBeUndefined();
    expect(readCookie("summit_session=%E0%A4%A", "summit_session")).toBeUndefined();
  });
});

describe("connecting", () => {
  it("refuses a connection without a login cookie", async () => {
    await expect(connectionError(null)).resolves.toBe("NOT_SIGNED_IN");
  });

  it("refuses a forged or expired token", async () => {
    await expect(connectionError("summit_session=not-a-real-token")).resolves.toBe("NOT_SIGNED_IN");
  });

  // Cross-site WebSocket hijacking: another website opening a socket from your browser.
  it("refuses a connection started by another website", async () => {
    const { cookie } = await register("Ana");

    await expect(connectionError(cookie, { origin: "https://evil.example" })).resolves.toBe(
      "websocket error",
    );
    await expect(connectAs(cookie, { origin: testConfig.webOrigin })).resolves.toBeDefined();
  });

  it("answers clock pings with the server's time", async () => {
    const { cookie } = await register("Ana");
    const ana = await connectAs(cookie);

    const pong = await ana.socket.emitWithAck("clock:ping", { clientTime: 123 });

    expect(pong).toEqual({ clientTime: 123, serverTime: clock.now() });
  });
});

describe("joining", () => {
  it("joins both climbers and shows each one's climb", async () => {
    const { ana } = await anaAndBenInARoom();

    const state = ana.states.at(-1);

    expect(state?.members.map((m) => [m.displayName, m.isHost, m.climb])).toEqual([
      ["Ana", true, { peakId: "mt-fuji", metersGained: 0 }],
      ["Ben", false, { peakId: "mt-fuji", metersGained: 0 }],
    ]);
  });

  it("explains a code with no open room, and a malformed request", async () => {
    const { cookie } = await register("Ana");
    const ana = await connectAs(cookie);

    const missing = await ana.socket.emitWithAck("room:join", { code: "K7QM2X" });
    // Sent as a hand-made client would: the wrong shape entirely.
    const malformed = await ana.socket.emitWithAck("room:join", { code: 42 } as never);

    expect(missing).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
    expect(malformed).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("refuses a session that's too long", async () => {
    const { ana } = await anaAndBenInARoom();

    const result = await ana.socket.emitWithAck("session:start", { plannedMinutes: 1000 });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });
});

describe("a team session", () => {
  it("completes for both climbers: saved with the room, and their climbs go up", async () => {
    const t = await anaAndBenInARoom();
    await startTeamSession(t);

    clock.advance(START_COUNTDOWN_MS + 25 * MINUTE);
    const after = await t.ben.waitForState((s) =>
      s.members.every((m) => m.climb.metersGained === 250),
    );
    await realtime.whenIdle();

    expect(after.lastOutcome).toMatchObject({ kind: "completed", metersEach: 250 });
    const saved = await prisma.focusSession.findMany({ where: { roomId: t.roomId } });
    expect(saved).toHaveLength(2);
    expect(saved.map((s) => [s.status, s.metersGained, s.plannedMinutes])).toEqual([
      ["COMPLETED", 250, 25],
      ["COMPLETED", 250, 25],
    ]);
    // It counts toward personal climbs, through the normal REST API too.
    const climb = await fetch(`${baseUrl}/api/climb`, { headers: { cookie: t.benUser.cookie } });
    expect(await climb.json()).toMatchObject({
      progress: { climbs: [{ peakId: "mt-fuji", metersGained: 250 }] },
    });
  });

  it("slips for everyone when one climber gives up early", async () => {
    const t = await anaAndBenInARoom();
    await startTeamSession(t);
    clock.advance(START_COUNTDOWN_MS + 10 * MINUTE);

    unwrap(await t.ben.socket.emitWithAck("session:give_up"));
    const seenByAna = await t.ana.waitForState((s) => s.lastOutcome?.kind === "slipped");
    await realtime.whenIdle();

    expect(seenByAna.lastOutcome).toMatchObject({ displayName: "Ben", reason: "gave_up" });
    const saved = await prisma.focusSession.findMany({ where: { roomId: t.roomId } });
    expect(saved.map((s) => [s.userId, s.status, s.metersGained]).sort()).toEqual(
      [
        [t.anaUser.userId, "ABANDONED", 0],
        [t.benUser.userId, "ABANDONED", 0],
      ].sort(),
    );
  });

  it("survives a dropped connection that comes back within the grace period", async () => {
    const t = await anaAndBenInARoom();
    await startTeamSession(t);
    clock.advance(5 * MINUTE);

    t.ben.socket.disconnect();
    await t.ana.waitForState((s) => statuses(s).Ben === "disconnected");
    clock.advance(RECONNECT_GRACE_MS - 1_000);
    const benAgain = await connectAs(t.benUser.cookie);
    const rejoined = unwrap(await benAgain.socket.emitWithAck("room:join", { code: t.code }));

    expect(statuses(rejoined)).toEqual({ Ana: "focusing", Ben: "focusing" });
    clock.advance(25 * MINUTE);
    await t.ana.waitForState((s) => s.lastOutcome?.kind === "completed");
  });

  it("slips when a dropped climber doesn't come back in time", async () => {
    const t = await anaAndBenInARoom();
    await startTeamSession(t);

    t.ben.socket.disconnect();
    await t.ana.waitForState((s) => statuses(s).Ben === "disconnected");
    clock.advance(RECONNECT_GRACE_MS);

    const state = await t.ana.waitForState((s) => s.lastOutcome?.kind === "slipped");
    expect(state.lastOutcome).toMatchObject({ displayName: "Ben", reason: "disconnected" });
    expect(state.members.map((m) => m.displayName)).toEqual(["Ana"]);
  });
});

describe("leaving", () => {
  it("hands the host role to Ben when Ana leaves, in the database too", async () => {
    const t = await anaAndBenInARoom();

    unwrap(await t.ana.socket.emitWithAck("room:leave"));
    const state = await t.ben.waitForState((s) => s.members.length === 1);
    await realtime.whenIdle();

    expect(state.members[0]).toMatchObject({ displayName: "Ben", isHost: true });
    const room = await prisma.room.findUniqueOrThrow({ where: { id: t.roomId } });
    expect(room.hostId).toBe(t.benUser.userId);
  });

  it("stops sending updates to someone who left", async () => {
    const t = await anaAndBenInARoom();
    unwrap(await t.ana.socket.emitWithAck("room:leave"));
    const seenByAna = t.ana.states.length;

    unwrap(await t.ben.socket.emitWithAck("session:start", { plannedMinutes: 25 }));
    await t.ben.waitForState((s) => s.phase.kind === "focus");

    expect(t.ana.states).toHaveLength(seenByAna);
  });

  it("closes the room when the last climber leaves, so its code stops working", async () => {
    const t = await anaAndBenInARoom();
    unwrap(await t.ana.socket.emitWithAck("room:leave"));
    unwrap(await t.ben.socket.emitWithAck("room:leave"));
    await realtime.whenIdle();

    const room = await prisma.room.findUniqueOrThrow({ where: { id: t.roomId } });
    expect(room.closedAt).not.toBeNull();
    const again = await t.ana.socket.emitWithAck("room:join", { code: t.code });
    expect(again).toMatchObject({ ok: false, error: { code: "ROOM_NOT_FOUND" } });
  });
});
