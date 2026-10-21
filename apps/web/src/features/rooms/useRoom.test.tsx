// Tests for useRoom, with a fake connection playing the server.
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  BEN_ID,
  FakeRoomConnection,
  makeMember,
  makeRoomState,
} from "../../test/fakeRoomConnection";
import { RoomConnectionContext, useRoom } from "./useRoom";

/** Renders useRoom with fake connections; `connection()` is the latest one. */
function renderRoom(code = "K7QM2X") {
  const connections: FakeRoomConnection[] = [];
  const createConnection = () => {
    const connection = new FakeRoomConnection();
    connections.push(connection);
    return connection;
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RoomConnectionContext value={createConnection}>{children}</RoomConnectionContext>
  );
  const hook = renderHook(() => useRoom(code), { wrapper });
  const connection = () => {
    const latest = connections.at(-1);
    if (!latest) throw new Error("no connection was created");
    return latest;
  };
  /** The "server" accepts the connection; resolves once we're in the room. */
  const connect = async () => {
    act(() => connection().emit({ type: "connected" }));
    await waitFor(() => expect(hook.result.current.status).toBe("in_room"));
  };
  return { ...hook, connection, connections, connect };
}

describe("useRoom", () => {
  it("opens a connection and joins the room once connected", async () => {
    const { result, connection, connect } = renderRoom();
    expect(result.current.status).toBe("connecting");
    expect(connection().isOpen).toBe(true);

    await connect();

    expect(connection().requests[0]).toBe("join K7QM2X");
    expect(result.current.room?.code).toBe("K7QM2X");
  });

  it("measures the clock offset after joining", async () => {
    const { result, connection, connect } = renderRoom();

    await connect();

    // The fake server's clock is 5 s ahead (give or take a millisecond of round trip).
    await waitFor(() => expect(result.current.offsetMs).toBeGreaterThan(4_990));
    expect(result.current.offsetMs).toBeLessThanOrEqual(5_000);
    expect(connection().requests.filter((r) => r === "ping")).toHaveLength(5);
  });

  it("shows every new snapshot the server sends", async () => {
    const { result, connection, connect } = renderRoom();
    await connect();
    const withBen = makeRoomState({
      members: [makeMember(), makeMember({ userId: BEN_ID, displayName: "Ben", isHost: false })],
    });

    act(() => connection().emit({ type: "state", state: withBen }));

    expect(result.current.room?.members.map((m) => m.displayName)).toEqual(["Ana", "Ben"]);
  });

  // This is what makes the server's reconnect grace period work in practice.
  it("keeps the room on screen during a blip, then joins again", async () => {
    const { result, connection, connect } = renderRoom();
    await connect();

    act(() => connection().emit({ type: "disconnected", willReconnect: true }));
    expect(result.current.status).toBe("reconnecting");
    expect(result.current.room).not.toBeNull();
    await connect();

    expect(connection().requests.filter((r) => r.startsWith("join"))).toHaveLength(2);
  });

  it("stops with the server's reason when the room can't be joined", async () => {
    const { result, connection } = renderRoom();
    connection().replies.join = () =>
      Promise.resolve({
        ok: false,
        error: { code: "ROOM_NOT_FOUND", message: "There's no open room with that code." },
      });

    act(() => connection().emit({ type: "connected" }));

    await waitFor(() => expect(result.current.status).toBe("failed"));
    // Closing the connection ourselves must not replace the real reason.
    expect(result.current.problem?.code).toBe("ROOM_NOT_FOUND");
    expect(connection().isOpen).toBe(false);
  });

  it("asks to sign in when the server refuses the connection", () => {
    const { result, connection } = renderRoom();

    act(() => connection().emit({ type: "refused", reason: "NOT_SIGNED_IN" }));

    expect(result.current.status).toBe("failed");
    expect(result.current.problem).toEqual({
      code: "NOT_SIGNED_IN",
      message: "Sign in to join a rope team.",
    });
  });

  it("reports a disconnect that won't be retried", async () => {
    const { result, connection, connect } = renderRoom();
    await connect();

    act(() => connection().emit({ type: "disconnected", willReconnect: false }));

    expect(result.current.status).toBe("failed");
    expect(result.current.problem?.code).toBe("DISCONNECTED");
  });

  it("starts a session and shows the room it returns", async () => {
    const { result, connection, connect } = renderRoom();
    await connect();
    const focusing = makeRoomState({
      phase: {
        kind: "focus",
        sessionId: "00000000-0000-4000-8000-000000000001",
        plannedMinutes: 25,
        startsAt: "2026-10-20T09:00:03.000Z",
        endsAt: "2026-10-20T09:25:03.000Z",
      },
    });
    connection().replies.startSession = () => Promise.resolve({ ok: true, data: focusing });

    const outcome = await act(() => result.current.startSession(25));

    expect(outcome.ok).toBe(true);
    expect(connection().requests).toContain("start 25");
    expect(result.current.room?.phase.kind).toBe("focus");
  });

  it("gives up through the connection", async () => {
    const { result, connection, connect } = renderRoom();
    await connect();

    await act(() => result.current.giveUp());

    expect(connection().requests).toContain("give up");
  });

  it("leaves: status 'left' and a closed connection, not a 'disconnected' problem", async () => {
    const { result, connection, connect } = renderRoom();
    await connect();

    await act(() => result.current.leave());

    expect(result.current.status).toBe("left");
    expect(result.current.problem).toBeNull();
    expect(connection().isOpen).toBe(false);
  });

  it("closes the connection when the page goes away, ignoring late answers", async () => {
    const { result, connection, unmount } = renderRoom();
    let answerJoin: (() => void) | undefined;
    connection().replies.join = (code) =>
      new Promise((resolve) => {
        answerJoin = () => resolve({ ok: true, data: makeRoomState({ code }) });
      });
    act(() => connection().emit({ type: "connected" }));

    unmount();
    // Answer the join after unmounting, and let the hook react (it must not).
    await act(() => Promise.resolve(answerJoin?.()));

    expect(connection().isOpen).toBe(false);
    expect(result.current.status).toBe("connecting");
    // It didn't carry on to sync the clock for a page that's gone.
    expect(connection().requests).toEqual(["join K7QM2X"]);
  });
});
