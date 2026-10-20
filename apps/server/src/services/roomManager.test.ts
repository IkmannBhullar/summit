// Tests for the live room manager. No sockets, no database: a ManualClock
// stands in for time, so a 25-minute session takes no time at all.
import {
  RECONNECT_GRACE_MS,
  ROOM_MAX_MEMBERS,
  RoomStateSchema,
  START_COUNTDOWN_MS,
  TEAM_BREAK_MINUTES,
  type RoomState,
} from "@summit/shared";
import { describe, expect, it } from "vitest";
import { ManualClock } from "../test/manualClock";
import { RoomManager, type EndedTeamSession, type Joiner, type RoomEvent } from "./roomManager";

const START = "2026-10-19T09:00:00.000Z";
const ROOM = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code: "K7QM2X" };
const OTHER_ROOM = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code: "P3RT9W" };
const MINUTE = 60_000;

/** A joiner with a valid UUID made from a digit, e.g. member(1) → "11111111-…". */
function member(n: number, displayName: string): Joiner {
  const d = String(n);
  return {
    userId: `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${d.repeat(12)}`,
    displayName,
    climb: { peakId: "mt-fuji", metersGained: 0 },
  };
}
const ana = member(1, "Ana");
const ben = member(2, "Ben");
const cal = member(3, "Cal");

/** A fresh manager with a fake clock, recording every event it emits. */
function setup() {
  const clock = new ManualClock(START);
  const events: RoomEvent[] = [];
  let ids = 0;
  const manager = new RoomManager({
    clock,
    schedule: clock.schedule,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
    notify: (event) => {
      // Every snapshot must match the shared contract (incl. "exactly one host").
      if (event.type === "state") RoomStateSchema.parse(event.state);
      events.push(event);
    },
  });

  /** Joins with a connection id named after the member ("Ana-1", "Ana-2", ...). */
  const join = (who: Joiner, tab = 1, room = ROOM) =>
    manager.join(room, who, `${who.displayName}-${tab}`);

  return {
    clock,
    manager,
    events,
    join,
    /** The most recent snapshot broadcast for the room. */
    latest: (roomId = ROOM.id): RoomState => {
      const last = events.findLast((e) => e.type === "state" && e.roomId === roomId);
      if (last?.type !== "state") throw new Error("no state broadcast yet");
      return last.state;
    },
    /** Every team session that has ended so far. */
    ended: (): EndedTeamSession[] =>
      events.flatMap((e) => (e.type === "session_ended" ? [e.session] : [])),
    /** Clears recorded events, to look only at what happens next. */
    reset: () => events.splice(0),
  };
}

/** Status by display name, e.g. { Ana: "focusing", Ben: "idle" }. */
const statuses = (state: RoomState) =>
  Object.fromEntries(state.members.map((m) => [m.displayName, m.status]));
const hostOf = (state: RoomState) => state.members.find((m) => m.isHost)?.displayName;

/** Unwraps a successful result, failing the test with the error otherwise. */
function data<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error.message}`);
  return result.data;
}
const errorCode = (result: { ok: boolean; error?: { code: string } }) => result.error?.code;

describe("joining and leaving", () => {
  it("makes the first member the host of an idle room", () => {
    const { join } = setup();

    const state = data(join(ana));

    expect(state).toEqual({
      code: "K7QM2X",
      members: [
        {
          userId: ana.userId,
          displayName: "Ana",
          isHost: true,
          status: "idle",
          reconnectBy: null,
          climb: { peakId: "mt-fuji", metersGained: 0 },
        },
      ],
      phase: { kind: "idle" },
      lastOutcome: null,
    });
  });

  it("broadcasts the new member to everyone, in join order", () => {
    const { join, latest } = setup();
    join(ana);

    join(ben);

    expect(latest().members.map((m) => m.displayName)).toEqual(["Ana", "Ben"]);
    expect(hostOf(latest())).toBe("Ana");
  });

  it(`turns away a ${ROOM_MAX_MEMBERS + 1}th climber, but not another tab of a member`, () => {
    const { join } = setup();
    for (let n = 1; n <= ROOM_MAX_MEMBERS; n++) data(join(member(n, `M${n}`)));

    expect(errorCode(join(member(9, "Nine")))).toBe("ROOM_FULL");
    expect(join(member(1, "M1"), 2).ok).toBe(true);
  });

  it("hands the host role to the longest-standing member when the host leaves", () => {
    const { join, manager, latest, events } = setup();
    join(ana);
    join(ben);
    join(cal);

    data(manager.leave(ana.userId));

    expect(hostOf(latest())).toBe("Ben");
    expect(events).toContainEqual({ type: "host_changed", roomId: ROOM.id, hostId: ben.userId });
  });

  it("skips a disconnected member when choosing the next host", () => {
    const { join, manager, latest } = setup();
    join(ana);
    join(ben);
    join(cal);
    manager.disconnect("Ben-1");

    manager.leave(ana.userId);

    expect(hostOf(latest())).toBe("Cal");
  });

  it("closes the room when the last member leaves", () => {
    const { join, manager, events, reset, clock } = setup();
    join(ana);
    reset();

    data(manager.leave(ana.userId));

    expect(events).toEqual([{ type: "closed", roomId: ROOM.id }]);
    expect(manager.stateOf(ROOM.id)).toBeNull();
    expect(clock.pendingTimers).toBe(0);
  });

  it("says so when someone who isn't in a room tries to leave", () => {
    const { manager } = setup();

    expect(errorCode(manager.leave(ana.userId))).toBe("NOT_IN_ROOM");
  });

  it("keeps a user in one room at a time", () => {
    const { join } = setup();
    join(ana);

    const result = join(ana, 2, OTHER_ROOM);

    expect(errorCode(result)).toBe("ALREADY_IN_ROOM");
  });

  it("lets a user who's only disconnected from their old room move to a new one", () => {
    const { join, manager, latest } = setup();
    join(ana);
    join(ben);
    manager.disconnect("Ana-1");

    data(join(ana, 2, OTHER_ROOM));

    expect(latest(ROOM.id).members.map((m) => m.displayName)).toEqual(["Ben"]);
    expect(manager.stateOf(OTHER_ROOM.id)?.members).toHaveLength(1);
  });

  it("shows a member's updated climb", () => {
    const { join, manager, latest } = setup();
    join(ana);

    manager.setClimb(ana.userId, { peakId: "mt-fuji", metersGained: 250 });

    expect(latest().members[0]?.climb.metersGained).toBe(250);
  });
});

describe("starting a team session", () => {
  it("starts after the countdown, for everyone connected", () => {
    const { join, manager } = setup();
    join(ana);
    join(ben);

    const state = data(manager.startSession(ana.userId, 25));

    const startsAt = Date.parse(START) + START_COUNTDOWN_MS;
    expect(state.phase).toEqual({
      kind: "focus",
      sessionId: "00000000-0000-4000-8000-000000000001",
      plannedMinutes: 25,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(startsAt + 25 * MINUTE).toISOString(),
    });
    expect(statuses(state)).toEqual({ Ana: "focusing", Ben: "focusing" });
  });

  it("only lets the host start", () => {
    const { join, manager } = setup();
    join(ana);
    join(ben);

    expect(errorCode(manager.startSession(ben.userId, 25))).toBe("NOT_HOST");
  });

  it("refuses to start a second session while one is running", () => {
    const { join, manager } = setup();
    join(ana);
    manager.startSession(ana.userId, 25);

    expect(errorCode(manager.startSession(ana.userId, 25))).toBe("SESSION_IN_PROGRESS");
  });

  it("leaves out a member who's mid-reconnect; they return idle", () => {
    const { join, manager, latest } = setup();
    join(ana);
    join(ben);
    manager.disconnect("Ben-1");

    manager.startSession(ana.userId, 25);
    expect(statuses(latest())).toEqual({ Ana: "focusing", Ben: "disconnected" });
    join(ben, 2);

    expect(statuses(latest())).toEqual({ Ana: "focusing", Ben: "idle" });
  });
});

describe("completing a team session", () => {
  /** Ana and Ben start 25 minutes; returns the moment focus ends. */
  function startTeam(t: ReturnType<typeof setup>) {
    t.join(ana);
    t.join(ben);
    t.manager.startSession(ana.userId, 25);
    return Date.parse(START) + START_COUNTDOWN_MS + 25 * MINUTE;
  }

  it("completes for everyone when the time runs out, then starts the break", () => {
    const t = setup();
    const endsAt = startTeam(t);

    t.clock.advance(START_COUNTDOWN_MS + 25 * MINUTE);

    expect(t.ended()).toEqual([
      {
        roomId: ROOM.id,
        sessionId: "00000000-0000-4000-8000-000000000001",
        plannedMinutes: 25,
        startedAt: new Date(Date.parse(START) + START_COUNTDOWN_MS),
        endedAt: new Date(endsAt),
        status: "COMPLETED",
        participantIds: [ana.userId, ben.userId],
      },
    ]);
    const state = t.latest();
    expect(state.lastOutcome).toEqual({
      kind: "completed",
      metersEach: 250,
      at: new Date(endsAt).toISOString(),
    });
    expect(state.phase).toEqual({
      kind: "break",
      endsAt: new Date(endsAt + TEAM_BREAK_MINUTES * MINUTE).toISOString(),
    });
    expect(statuses(state)).toEqual({ Ana: "on_break", Ben: "on_break" });
  });

  it("doesn't end a moment early", () => {
    const t = setup();
    startTeam(t);

    t.clock.advance(START_COUNTDOWN_MS + 25 * MINUTE - 1);

    expect(t.ended()).toEqual([]);
    expect(t.latest().phase.kind).toBe("focus");
  });

  it("goes back to idle after the break", () => {
    const t = setup();
    startTeam(t);

    t.clock.advance(START_COUNTDOWN_MS + 25 * MINUTE + TEAM_BREAK_MINUTES * MINUTE);

    expect(t.latest().phase).toEqual({ kind: "idle" });
    expect(statuses(t.latest())).toEqual({ Ana: "idle", Ben: "idle" });
    expect(t.clock.pendingTimers).toBe(0);
  });

  it("lets the host start the next session during the break", () => {
    const t = setup();
    startTeam(t);
    t.clock.advance(START_COUNTDOWN_MS + 25 * MINUTE + MINUTE);

    const state = data(t.manager.startSession(ana.userId, 25));
    expect(state.lastOutcome).toBeNull();
    // The old break's timer must not knock the new session back to idle.
    t.clock.advance(TEAM_BREAK_MINUTES * MINUTE);

    expect(t.latest().phase.kind).toBe("focus");
  });
});

describe("slipping", () => {
  it("abandons the session for everyone when one climber gives up", () => {
    const t = setup();
    t.join(ana);
    t.join(ben);
    t.manager.startSession(ana.userId, 25);
    t.clock.advance(START_COUNTDOWN_MS + 10 * MINUTE);

    const state = data(t.manager.giveUp(ben.userId));

    expect(t.ended()).toMatchObject([
      { status: "ABANDONED", participantIds: [ana.userId, ben.userId] },
    ]);
    expect(t.ended()[0]?.endedAt).toEqual(
      new Date(Date.parse(START) + START_COUNTDOWN_MS + 10 * MINUTE),
    );
    expect(state.lastOutcome).toMatchObject({
      kind: "slipped",
      displayName: "Ben",
      reason: "gave_up",
    });
    expect(state.phase).toEqual({ kind: "idle" });
    expect(statuses(state)).toEqual({ Ana: "idle", Ben: "idle" });
  });

  // A leftover timer from the slipped session would end the NEXT one early.
  it("cancels the slipped session's timer, so it can't end the next session early", () => {
    const t = setup();
    t.join(ana);
    t.manager.startSession(ana.userId, 25);
    t.clock.advance(START_COUNTDOWN_MS + 10 * MINUTE);
    t.manager.giveUp(ana.userId);
    t.manager.startSession(ana.userId, 25);

    // Past where the FIRST session would have ended, well before the second's end.
    t.clock.advance(20 * MINUTE);

    expect(t.ended().map((s) => s.status)).toEqual(["ABANDONED"]);
    expect(t.latest().phase.kind).toBe("focus");
  });

  it("slips right away when a climber leaves mid-session, and saves theirs too", () => {
    const t = setup();
    t.join(ana);
    t.join(ben);
    t.manager.startSession(ana.userId, 25);

    data(t.manager.leave(ben.userId));

    expect(t.ended()).toMatchObject([
      { status: "ABANDONED", participantIds: [ana.userId, ben.userId] },
    ]);
    expect(t.latest().lastOutcome).toMatchObject({ displayName: "Ben", reason: "left" });
  });

  it("ends a session abandoned during the countdown at its start time, never before", () => {
    const t = setup();
    t.join(ana);
    t.manager.startSession(ana.userId, 25);
    t.clock.advance(1_000);

    t.manager.giveUp(ana.userId);

    const [session] = t.ended();
    expect(session?.endedAt).toEqual(session?.startedAt);
  });

  it("can't give up when there's no session", () => {
    const t = setup();
    t.join(ana);

    expect(errorCode(t.manager.giveUp(ana.userId))).toBe("NO_SESSION");
    expect(errorCode(t.manager.giveUp(ben.userId))).toBe("NOT_IN_ROOM");
  });
});

describe("spectators (joined mid-session)", () => {
  it("can watch but aren't part of the session, so they can't slip it", () => {
    const t = setup();
    t.join(ana);
    t.manager.startSession(ana.userId, 25);
    t.join(ben);
    expect(statuses(t.latest())).toEqual({ Ana: "focusing", Ben: "idle" });

    expect(errorCode(t.manager.giveUp(ben.userId))).toBe("NO_SESSION");
    t.manager.leave(ben.userId);
    t.clock.advance(START_COUNTDOWN_MS + 25 * MINUTE);

    expect(t.ended()).toMatchObject([{ status: "COMPLETED", participantIds: [ana.userId] }]);
  });
});

describe("disconnects", () => {
  it("gives a dropped climber time to come back without slipping the team", () => {
    const t = setup();
    t.join(ana);
    t.join(ben);
    t.manager.startSession(ana.userId, 25);
    t.clock.advance(5 * MINUTE);

    t.manager.disconnect("Ben-1");
    const ben1 = t.latest().members.find((m) => m.displayName === "Ben");
    expect(ben1).toMatchObject({
      status: "disconnected",
      reconnectBy: new Date(Date.parse(START) + 5 * MINUTE + RECONNECT_GRACE_MS).toISOString(),
    });
    t.clock.advance(RECONNECT_GRACE_MS - 1);
    t.join(ben, 2);
    expect(statuses(t.latest())).toEqual({ Ana: "focusing", Ben: "focusing" });
    t.clock.advance(25 * MINUTE);

    expect(t.ended()).toMatchObject([
      { status: "COMPLETED", participantIds: [ana.userId, ben.userId] },
    ]);
  });

  it("slips the team when a climber doesn't come back in time", () => {
    const t = setup();
    t.join(ana);
    t.join(ben);
    t.manager.startSession(ana.userId, 25);
    t.manager.disconnect("Ben-1");

    t.clock.advance(RECONNECT_GRACE_MS);

    expect(t.ended()).toMatchObject([{ status: "ABANDONED" }]);
    expect(t.latest().lastOutcome).toMatchObject({ displayName: "Ben", reason: "disconnected" });
    expect(t.latest().members.map((m) => m.displayName)).toEqual(["Ana"]);
  });

  it("keeps a member connected while another of their tabs is open", () => {
    const t = setup();
    t.join(ana);
    t.join(ana, 2);
    t.manager.startSession(ana.userId, 25);

    t.manager.disconnect("Ana-1");
    t.clock.advance(RECONNECT_GRACE_MS);

    expect(statuses(t.latest())).toEqual({ Ana: "focusing" });
    expect(t.ended()).toEqual([]);
  });

  it("quietly removes an idle member after the grace period and closes an empty room", () => {
    const t = setup();
    t.join(ana);
    t.join(ben);
    t.manager.disconnect("Ana-1");
    t.manager.disconnect("Ben-1");
    // The host stays host while they might still come back.
    expect(hostOf(t.latest())).toBe("Ana");

    t.clock.advance(RECONNECT_GRACE_MS);

    expect(t.ended()).toEqual([]);
    expect(t.events.at(-1)).toEqual({ type: "closed", roomId: ROOM.id });
    expect(t.manager.stateOf(ROOM.id)).toBeNull();
  });

  it("ignores a connection it doesn't know", () => {
    const t = setup();
    t.join(ana);
    t.reset();

    t.manager.disconnect("never-joined");

    expect(t.events).toEqual([]);
  });
});
