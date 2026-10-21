// Tests for the Socket.io wrapper, using a fake socket: they check how
// socket events and replies are translated, not Socket.io itself.
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeRoomState } from "../../test/fakeRoomConnection";
import {
  createSocketConnection,
  REQUEST_TIMEOUT_MS,
  type ConnectionEvent,
  type RoomSocket,
} from "./roomConnection";

type Handler = (...args: unknown[]) => void;

/** Just enough of a Socket.io client socket for the wrapper. */
function fakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const sent: { event: string; args: unknown[]; timeoutMs: number }[] = [];
  let reply: (event: string) => Promise<unknown> = () => Promise.resolve({ ok: true, data: null });

  const socket = {
    active: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    on(event: string, handler: Handler) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      return socket;
    },
    off(event: string, handler: Handler) {
      handlers.get(event)?.delete(handler);
      return socket;
    },
    timeout(timeoutMs: number) {
      return {
        emitWithAck: (event: string, ...args: unknown[]) => {
          sent.push({ event, args, timeoutMs });
          return reply(event);
        },
      };
    },
  };

  return {
    socket,
    connection: createSocketConnection(socket as unknown as RoomSocket),
    sent,
    /** Pretends the server sent this socket event. */
    fire: (event: string, ...args: unknown[]) => {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
    replyWith: (fn: (event: string) => Promise<unknown>) => {
      reply = fn;
    },
    listenerCount: () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

/** Subscribes and collects every event the wrapper reports. */
function listen(connection: ReturnType<typeof fakeSocket>["connection"]) {
  const events: ConnectionEvent[] = [];
  const stop = connection.subscribe((event) => events.push(event));
  return { events, stop };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSocketConnection", () => {
  it("passes on valid room snapshots, and skips invalid ones", () => {
    const fake = fakeSocket();
    const { events } = listen(fake.connection);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    fake.fire("room:state", makeRoomState());
    fake.fire("room:state", { code: "nope" });

    expect(events).toEqual([{ type: "state", state: makeRoomState() }]);
    expect(error).toHaveBeenCalledOnce();
  });

  it("tells a refusal (no retrying) apart from a network problem (retrying)", () => {
    const fake = fakeSocket();
    const { events } = listen(fake.connection);

    fake.fire("connect_error", new Error("xhr poll error"));
    fake.socket.active = false;
    fake.fire("connect_error", new Error("NOT_SIGNED_IN"));

    expect(events).toEqual([
      { type: "disconnected", willReconnect: true },
      { type: "refused", reason: "NOT_SIGNED_IN" },
    ]);
  });

  it("reports connects and disconnects, and whether Socket.io will retry", () => {
    const fake = fakeSocket();
    const { events } = listen(fake.connection);

    fake.fire("connect");
    fake.fire("disconnect");
    fake.socket.active = false;
    fake.fire("disconnect");

    expect(events).toEqual([
      { type: "connected" },
      { type: "disconnected", willReconnect: true },
      { type: "disconnected", willReconnect: false },
    ]);
  });

  it("sends requests with a timeout and returns the server's answer", async () => {
    const fake = fakeSocket();
    fake.replyWith(() => Promise.resolve({ ok: true, data: makeRoomState() }));

    const result = await fake.connection.join("K7QM2X");

    expect(result).toEqual({ ok: true, data: makeRoomState() });
    expect(fake.sent).toEqual([
      { event: "room:join", args: [{ code: "K7QM2X" }], timeoutMs: REQUEST_TIMEOUT_MS },
    ]);
  });

  it("turns a request with no answer into a NO_CONNECTION result", async () => {
    const fake = fakeSocket();
    fake.replyWith(() => Promise.reject(new Error("operation has timed out")));

    const result = await fake.connection.startSession(25);

    expect(result).toMatchObject({ ok: false, error: { code: "NO_CONNECTION" } });
  });

  it("stops listening when unsubscribed", () => {
    const fake = fakeSocket();
    const { stop } = listen(fake.connection);
    expect(fake.listenerCount()).toBe(4);

    stop();

    expect(fake.listenerCount()).toBe(0);
  });

  it("opens and closes the socket", () => {
    const fake = fakeSocket();

    fake.connection.open();
    fake.connection.close();

    expect(fake.socket.connect).toHaveBeenCalledOnce();
    expect(fake.socket.disconnect).toHaveBeenCalledOnce();
  });
});
