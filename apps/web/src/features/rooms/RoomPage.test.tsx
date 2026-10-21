// Tests for /rooms/:code, the rope team room, through the whole app with a
// fake connection playing the server.
import type { RoomMember, RoomPhase, RoomState } from "@summit/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANA_ID,
  BEN_ID,
  makeMember,
  makeRoomState,
  type FakeRoomConnection,
} from "../../test/fakeRoomConnection";
import { renderRoomApp, signInAsAna } from "../../test/renderRoomApp";
import { chime } from "../alerts/chime";
import { showNotification } from "../alerts/notifications";

vi.mock("../alerts/chime", () => ({ chime: { unlock: vi.fn(), play: vi.fn() } }));
vi.mock("../alerts/notifications", () => ({
  notificationStatus: vi.fn(() => "default"),
  requestNotificationPermission: vi.fn(() => Promise.resolve("granted")),
  showNotification: vi.fn(async () => {}),
}));

const MIN = 60_000;
const ben = (overrides: Partial<RoomMember> = {}) =>
  makeMember({ userId: BEN_ID, displayName: "Ben", isHost: false, ...overrides });

/** A focus phase relative to the device clock, e.g. focusPhase(-MIN, 24 * MIN). */
function focusPhase(startsInMs: number, endsInMs: number): RoomPhase {
  return {
    kind: "focus",
    sessionId: "00000000-0000-4000-8000-000000000001",
    plannedMinutes: 25,
    startsAt: new Date(Date.now() + startsInMs).toISOString(),
    endsAt: new Date(Date.now() + endsInMs).toISOString(),
  };
}

/** Opens the room page with the server answering the join with `state`. */
async function openRoom(
  state: RoomState = makeRoomState(),
  configure?: (c: FakeRoomConnection) => void,
) {
  const app = renderRoomApp("/rooms/K7QM2X", (connection) => {
    connection.replies.join = () => Promise.resolve({ ok: true, data: state });
    configure?.(connection);
  });
  // The page opens its connection once the user is known; then the server accepts.
  await waitFor(() => expect(app.connections).toHaveLength(1));
  act(() => app.connection().emit({ type: "connected" }));
  await screen.findByRole("heading", { name: "Rope team" });
  return app;
}

beforeEach(() => {
  signInAsAna();
  vi.clearAllMocks();
});

describe("joining from the link", () => {
  it("joins the room in the URL and lists the climbers", async () => {
    const { connection } = await openRoom(
      makeRoomState({
        members: [makeMember(), ben({ climb: { peakId: "mt-rainier", metersGained: 1250 } })],
      }),
    );

    expect(connection().requests[0]).toBe("join K7QM2X");
    expect(screen.getByText("K7Q-M2X")).toBeInTheDocument();
    const climbers = within(screen.getByRole("region", { name: /Climbers/ }));
    expect(climbers.getByText("(you)")).toBeInTheDocument();
    expect(climbers.getByText("Host")).toBeInTheDocument();
    expect(climbers.getByText("Mt. Rainier · 1,250 m")).toBeInTheDocument();
    // Both on the team mountain too.
    expect(
      screen.getByRole("img", { name: /^Rope team of 2 climbers: Ana .*; Ben / }),
    ).toBeInTheDocument();
  });

  it("tidies a loosely typed code into the real link", async () => {
    renderRoomApp("/rooms/k7q-m2x");

    await waitFor(() => expect(window.location.pathname).toBe("/rooms/K7QM2X"));
  });

  it("explains a link that can't be a room", async () => {
    renderRoomApp("/rooms/nope");

    expect(await screen.findByRole("alert")).toHaveTextContent("That isn't a room code.");
    expect(screen.getByRole("link", { name: "Back to rope teams" })).toBeInTheDocument();
  });

  it("shows the server's reason when it can't join", async () => {
    const app = renderRoomApp("/rooms/K7QM2X", (connection) => {
      connection.replies.join = () =>
        Promise.resolve({
          ok: false,
          error: { code: "ROOM_FULL", message: "This rope team is full (8 climbers)." },
        });
    });
    await waitFor(() => expect(app.connections).toHaveLength(1));

    act(() => app.connection().emit({ type: "connected" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This rope team is full");
  });

  it("says when it's reconnecting, keeping the room on screen", async () => {
    const { connection } = await openRoom();

    act(() => connection().emit({ type: "disconnected", willReconnect: true }));

    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting…");
    expect(screen.getByRole("heading", { name: "Rope team" })).toBeInTheDocument();
  });

  it("shows how long a dropped teammate has to come back", async () => {
    await openRoom(
      makeRoomState({
        members: [
          makeMember(),
          ben({ status: "disconnected", reconnectBy: new Date(Date.now() + 12_000).toISOString() }),
        ],
      }),
    );

    expect(screen.getByText("Reconnecting… 12s")).toBeInTheDocument();
  });
});

describe("starting", () => {
  it("lets the host pick a length and start for everyone", async () => {
    const { user, connection } = await openRoom();

    await user.selectOptions(screen.getByLabelText("Focus length"), "45");
    await user.click(screen.getByRole("button", { name: "Start team session" }));

    expect(connection().requests).toContain("start 45");
  });

  it("tells everyone else who they're waiting for", async () => {
    await openRoom(
      makeRoomState({ members: [ben({ isHost: true }), makeMember({ isHost: false })] }),
    );

    expect(screen.getByText("Waiting for Ben to start a session.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start team session" })).not.toBeInTheDocument();
  });

  it("counts down before focus begins", async () => {
    await openRoom(
      makeRoomState({
        members: [makeMember({ status: "focusing" })],
        phase: focusPhase(3_000, 3_000 + 25 * MIN),
      }),
    );

    expect(screen.getByText("Starting in")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("3");
  });
});

describe("during focus", () => {
  const focusing = () =>
    makeRoomState({
      members: [makeMember({ status: "focusing" }), ben({ status: "focusing" })],
      phase: focusPhase(-MIN, 24 * MIN),
    });

  it("shows the time left from the server's end time", async () => {
    await openRoom(focusing());

    expect(screen.getByRole("timer")).toHaveTextContent("24:00");
  });

  // The device clock is a minute behind the server here, so without the
  // offset the timer would show a minute too much.
  it("corrects for this device's clock being off", async () => {
    const serverAhead = (c: FakeRoomConnection) => {
      c.replies.ping = (clientTime) =>
        Promise.resolve({ clientTime, serverTime: clientTime + MIN });
    };
    await openRoom(
      makeRoomState({
        members: [makeMember({ status: "focusing" })],
        phase: focusPhase(0, 11 * MIN),
      }),
      serverAhead,
    );

    await waitFor(() => expect(screen.getByRole("timer")).toHaveTextContent("10:00"));
  });

  it("gives up for the whole team only after confirming", async () => {
    const { user, connection } = await openRoom(focusing());

    await user.click(screen.getByRole("button", { name: "Give up" }));
    const dialog = screen.getByRole("dialog", { name: "Give up for the whole team?" });
    await user.click(within(dialog).getByRole("button", { name: "Give up" }));

    expect(connection().requests).toContain("give up");
  });

  it("lets a late joiner watch, without a Give up button", async () => {
    await openRoom(
      makeRoomState({
        members: [makeMember({ isHost: false }), ben({ isHost: true, status: "focusing" })],
        phase: focusPhase(-MIN, 24 * MIN),
      }),
    );

    expect(screen.getByText(/You joined mid-session/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Give up" })).not.toBeInTheDocument();
  });

  it("asks before leaving mid-session, and staying sends nothing", async () => {
    const { user, connection } = await openRoom(focusing());

    await user.click(screen.getByRole("button", { name: "Leave rope team" }));
    const dialog = screen.getByRole("dialog", { name: "Leave mid-session?" });
    await user.click(within(dialog).getByRole("button", { name: "Stay" }));

    expect(connection().requests).not.toContain("leave");
  });
});

describe("after a session", () => {
  it("says who slipped the team", async () => {
    await openRoom(
      makeRoomState({
        lastOutcome: {
          kind: "slipped",
          displayName: "Ben",
          reason: "gave_up",
          at: "2026-10-20T09:10:00.000Z",
        },
      }),
    );

    expect(
      screen.getByText("Ben gave up, so the rope team slipped. No meters this time."),
    ).toBeInTheDocument();
  });

  it("chimes for a session that ends while you're here, not for an old result", async () => {
    const old = { kind: "completed", metersEach: 250, at: "2026-10-20T08:00:00.000Z" } as const;
    const { connection } = await openRoom(makeRoomState({ lastOutcome: old }));
    expect(chime.play).not.toHaveBeenCalled();

    act(() =>
      connection().emit({
        type: "state",
        state: makeRoomState({
          phase: { kind: "break", endsAt: new Date(Date.now() + 5 * MIN).toISOString() },
          lastOutcome: { ...old, at: "2026-10-20T09:25:03.000Z" },
        }),
      }),
    );

    expect(chime.play).toHaveBeenCalledWith("focusEnd");
    expect(showNotification).toHaveBeenCalledWith(
      "Team session complete!",
      "Summit push complete: +250 m each.",
    );
    expect(screen.getByText("Team break")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start next session" })).toBeInTheDocument();
  });
});

describe("the invite and leaving", () => {
  it("copies the invite link", async () => {
    const { user } = await openRoom();

    await user.click(screen.getByRole("button", { name: "Copy invite link" }));

    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/rooms/K7QM2X`);
    expect(screen.getByRole("button", { name: "Link copied!" })).toBeInTheDocument();
  });

  it("leaves and goes back to the rope teams page", async () => {
    const { user, connection } = await openRoom();

    await user.click(screen.getByRole("button", { name: "Leave rope team" }));

    await waitFor(() => expect(window.location.pathname).toBe("/rooms"));
    expect(connection().requests).toContain("leave");
    expect(connection().isOpen).toBe(false);
  });
});

describe("whose page is it", () => {
  it("knows which climber is you by the signed-in account", async () => {
    await openRoom(
      makeRoomState({
        members: [ben({ isHost: true }), makeMember({ userId: ANA_ID, isHost: false })],
      }),
    );

    const you = screen.getByText("(you)").closest("li");
    expect(you).toHaveTextContent("Ana");
  });
});
