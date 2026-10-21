/**
 * The live side of rope team rooms: who's in each room right now, who's
 * host, and the running team session (countdown → focus → break).
 *
 * This is plain TypeScript, with no Socket.io and no database. The socket
 * layer calls its methods ("Ana joined", "Ben gave up") and listens to the
 * events it emits through `notify`:
 *
 *   state          the room changed: broadcast this snapshot to its members
 *   session_ended  a team session finished: save one FocusSession per participant
 *   host_changed   persist the new host
 *   closed         the last member is gone: mark the room closed
 *
 * Time comes from an injected clock and scheduler, so tests can run a whole
 * 25-minute session in milliseconds with exact timestamps.
 *
 * Everything lives in this process's memory: one server instance only, and
 * a restart ends running sessions (see docs/decisions.md).
 */
import {
  metersEarned,
  RECONNECT_GRACE_MS,
  ROOM_MAX_MEMBERS,
  START_COUNTDOWN_MS,
  TEAM_BREAK_MINUTES,
  type AckResult,
  type RoomErrorCode,
  type RoomMember,
  type RoomOutcome,
  type RoomPhase,
  type RoomState,
} from "@summit/shared";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Injected time
// ---------------------------------------------------------------------------

/** The current time in ms since the epoch. */
export interface Clock {
  now: () => number;
}

/** Runs `run` after `delayMs`, and returns a function that cancels it. */
export type Schedule = (delayMs: number, run: () => void) => () => void;

export const systemClock: Clock = { now: () => Date.now() };

/** The real scheduler: a plain setTimeout. (It only fires once, at the end:
 *  the remaining time is never counted with ticks.) */
export const systemSchedule: Schedule = (delayMs, run) => {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The database row a live room belongs to. */
export interface StoredRoom {
  id: string;
  code: string;
}

/** Someone joining a room, as the socket layer knows them. */
export interface Joiner {
  userId: string;
  displayName: string;
  climb: RoomMember["climb"];
}

/** A team session that just ended. Each participant gets a saved FocusSession. */
export interface EndedTeamSession {
  roomId: string;
  sessionId: string;
  plannedMinutes: number;
  /** When the focus started (after the countdown). */
  startedAt: Date;
  endedAt: Date;
  status: "COMPLETED" | "ABANDONED";
  /** Everyone in the session, including whoever left or gave up. */
  participantIds: string[];
}

export type RoomEvent =
  | { type: "state"; roomId: string; state: RoomState }
  | { type: "session_ended"; session: EndedTeamSession }
  | { type: "host_changed"; roomId: string; hostId: string }
  | { type: "closed"; roomId: string };

export interface RoomManagerDeps {
  notify: (event: RoomEvent) => void;
  clock?: Clock;
  schedule?: Schedule;
  /** Makes team session ids. Tests inject predictable ones. */
  newId?: () => string;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface LiveMember {
  userId: string;
  displayName: string;
  climb: RoomMember["climb"];
  /** Open connections (one per browser tab). Zero means disconnected. */
  connections: Set<string>;
  /** While disconnected: when their grace period ends, and how to cancel it. */
  grace: { endsAt: number; cancel: () => void } | null;
}

/** Like the shared RoomPhase, but with numbers for times, the participants,
 *  and the cancel function of the timer that ends the phase. */
type LivePhase =
  | { kind: "idle" }
  | {
      kind: "focus";
      sessionId: string;
      plannedMinutes: number;
      startsAt: number;
      endsAt: number;
      participants: Set<string>;
      cancel: () => void;
    }
  | { kind: "break"; endsAt: number; participants: Set<string>; cancel: () => void };

interface LiveRoom {
  id: string;
  code: string;
  /** A Map keeps insertion order: join order, which decides who's next to host. */
  members: Map<string, LiveMember>;
  hostId: string;
  phase: LivePhase;
  lastOutcome: RoomOutcome | null;
}

const ok = <T>(data: T): AckResult<T> => ({ ok: true, data });
const fail = <T>(code: RoomErrorCode, message: string): AckResult<T> => ({
  ok: false,
  error: { code, message },
});
const iso = (ms: number) => new Date(ms).toISOString();

// ---------------------------------------------------------------------------
// The manager
// ---------------------------------------------------------------------------

export class RoomManager {
  /** Live rooms by database id. */
  private readonly rooms = new Map<string, LiveRoom>();
  /** Which room each user is in (one at a time). */
  private readonly roomOfUser = new Map<string, LiveRoom>();
  /** Which user each connection belongs to. */
  private readonly userOfConnection = new Map<string, string>();

  private readonly notify: (event: RoomEvent) => void;
  private readonly clock: Clock;
  private readonly schedule: Schedule;
  private readonly newId: () => string;

  constructor(deps: RoomManagerDeps) {
    this.notify = deps.notify;
    this.clock = deps.clock ?? systemClock;
    this.schedule = deps.schedule ?? systemSchedule;
    this.newId = deps.newId ?? randomUUID;
  }

  // ----- Membership --------------------------------------------------------

  /**
   * Adds a connection to a room: a new member, another tab of an existing
   * member, or a member coming back within their grace period.
   * The socket layer has already checked the room is open in the database.
   */
  join(stored: StoredRoom, joiner: Joiner, connectionId: string): AckResult<RoomState> {
    const elsewhere = this.roomOfUser.get(joiner.userId);
    if (elsewhere && elsewhere.id !== stored.id) {
      const there = elsewhere.members.get(joiner.userId);
      if (there && there.connections.size > 0) {
        return fail(
          "ALREADY_IN_ROOM",
          `You're in room ${elsewhere.code} in another tab. Leave it first.`,
        );
      }
      // Only a stale, disconnected membership: they've moved on, so leave it.
      this.removeMember(elsewhere, joiner.userId, "disconnected");
      this.publish(elsewhere);
    }

    const existingRoom = this.rooms.get(stored.id);
    const member = existingRoom?.members.get(joiner.userId);
    if (!member && existingRoom && existingRoom.members.size >= ROOM_MAX_MEMBERS) {
      return fail("ROOM_FULL", `This rope team is full (${ROOM_MAX_MEMBERS} climbers).`);
    }

    // Create the live room on its first join (it's only in the database until then).
    const room = existingRoom ?? this.openRoom(stored, joiner.userId);

    if (member) {
      // Another tab, or back within the grace period: cancel the countdown to removal.
      member.connections.add(connectionId);
      member.grace?.cancel();
      member.grace = null;
    } else {
      room.members.set(joiner.userId, {
        ...joiner,
        connections: new Set([connectionId]),
        grace: null,
      });
      this.roomOfUser.set(joiner.userId, room);
    }
    this.userOfConnection.set(connectionId, joiner.userId);

    this.publish(room);
    return ok(this.snapshot(room));
  }

  /** A deliberate leave. Mid-session, the rope team slips immediately. */
  leave(userId: string): AckResult<null> {
    const room = this.roomOfUser.get(userId);
    if (!room) return fail("NOT_IN_ROOM", "You're not in a room.");

    this.removeMember(room, userId, "left");
    this.publish(room);
    return ok(null);
  }

  /** Updates a member's climb (e.g. after their sessions were saved). */
  setClimb(userId: string, climb: RoomMember["climb"]): void {
    const room = this.roomOfUser.get(userId);
    const member = room?.members.get(userId);
    if (!room || !member) return;
    member.climb = climb;
    this.publish(room);
  }

  /** The id of the room this user is in, if any. */
  roomIdOf(userId: string): string | null {
    return this.roomOfUser.get(userId)?.id ?? null;
  }

  /** The room's current snapshot, or null if it isn't live. */
  stateOf(roomId: string): RoomState | null {
    const room = this.rooms.get(roomId);
    return room ? this.snapshot(room) : null;
  }

  // ----- The team session --------------------------------------------------

  /**
   * The host starts a team session for everyone connected. Focus begins
   * after a short countdown, so all clocks start together. Allowed from
   * idle or during the break (which it cuts short).
   */
  startSession(userId: string, plannedMinutes: number): AckResult<RoomState> {
    const room = this.roomOfUser.get(userId);
    if (!room) return fail("NOT_IN_ROOM", "You're not in a room.");
    if (room.hostId !== userId) return fail("NOT_HOST", "Only the host can start a session.");
    if (room.phase.kind === "focus") {
      return fail("SESSION_IN_PROGRESS", "A team session is already running.");
    }
    if (room.phase.kind === "break") room.phase.cancel();

    const now = this.clock.now();
    const startsAt = now + START_COUNTDOWN_MS;
    const endsAt = startsAt + plannedMinutes * 60_000;
    // Only connected members take part; someone mid-reconnect joins the next one.
    const participants = new Set(
      [...room.members.values()].filter((m) => m.connections.size > 0).map((m) => m.userId),
    );
    room.phase = {
      kind: "focus",
      sessionId: this.newId(),
      plannedMinutes,
      startsAt,
      endsAt,
      participants,
      // One timer, at the end. The remaining time is always endsAt − now.
      cancel: this.schedule(endsAt - now, () => {
        this.complete(room);
        this.publish(room);
      }),
    };
    room.lastOutcome = null;

    this.publish(room);
    return ok(this.snapshot(room));
  }

  /** A participant gives up: the whole rope team slips. */
  giveUp(userId: string): AckResult<RoomState> {
    const room = this.roomOfUser.get(userId);
    const member = room?.members.get(userId);
    if (!room || !member) return fail("NOT_IN_ROOM", "You're not in a room.");
    if (room.phase.kind !== "focus" || !room.phase.participants.has(userId)) {
      return fail("NO_SESSION", "You're not in a running team session.");
    }

    this.slip(room, member.displayName, "gave_up");
    this.publish(room);
    return ok(this.snapshot(room));
  }

  // ----- Connections -------------------------------------------------------

  /**
   * A connection dropped (tab closed, network blip). If it was the member's
   * last one, they get a grace period to come back before they're removed,
   * which slips the team if a session is running.
   */
  disconnect(connectionId: string): void {
    const userId = this.userOfConnection.get(connectionId);
    if (!userId) return;
    this.userOfConnection.delete(connectionId);
    const room = this.roomOfUser.get(userId);
    const member = room?.members.get(userId);
    if (!room || !member) return;

    member.connections.delete(connectionId);
    // Another tab is still open: nothing changes for the team.
    if (member.connections.size > 0) return;

    member.grace = {
      endsAt: this.clock.now() + RECONNECT_GRACE_MS,
      cancel: this.schedule(RECONNECT_GRACE_MS, () => {
        member.grace = null;
        this.removeMember(room, userId, "disconnected");
        this.publish(room);
      }),
    };
    this.publish(room);
  }

  // ----- Internals ---------------------------------------------------------
  // These change state but don't publish it. Each public method (or timer)
  // publishes once at the end, so one action sends one snapshot.

  private openRoom(stored: StoredRoom, firstUserId: string): LiveRoom {
    const room: LiveRoom = {
      id: stored.id,
      code: stored.code,
      members: new Map(),
      hostId: firstUserId,
      phase: { kind: "idle" },
      lastOutcome: null,
    };
    this.rooms.set(room.id, room);
    return room;
  }

  /** Removes a member completely, then fixes up the session, host, and room. */
  private removeMember(room: LiveRoom, userId: string, reason: "left" | "disconnected"): void {
    const member = room.members.get(userId);
    if (!member) return;

    member.grace?.cancel();
    for (const connectionId of member.connections) this.userOfConnection.delete(connectionId);
    room.members.delete(userId);
    this.roomOfUser.delete(userId);

    if (room.phase.kind === "focus" && room.phase.participants.has(userId)) {
      this.slip(room, member.displayName, reason);
    }

    if (room.members.size === 0) {
      this.close(room);
    } else if (room.hostId === userId) {
      this.promoteNextHost(room);
    }
  }

  /** The longest-standing member becomes host, preferring someone connected. */
  private promoteNextHost(room: LiveRoom): void {
    const members = [...room.members.values()];
    const next = members.find((m) => m.connections.size > 0) ?? members[0];
    if (!next) return;
    room.hostId = next.userId;
    this.notify({ type: "host_changed", roomId: room.id, hostId: next.userId });
  }

  /** The focus time ran out with everyone still roped in: success. */
  private complete(room: LiveRoom): void {
    const phase = room.phase;
    if (phase.kind !== "focus") return;
    const now = this.clock.now();

    this.notify({
      type: "session_ended",
      session: {
        ...this.endedSession(room, phase),
        endedAt: new Date(now),
        status: "COMPLETED",
      },
    });
    room.lastOutcome = {
      kind: "completed",
      metersEach: metersEarned("COMPLETED", phase.plannedMinutes),
      at: iso(now),
    };

    const breakEndsAt = now + TEAM_BREAK_MINUTES * 60_000;
    room.phase = {
      kind: "break",
      endsAt: breakEndsAt,
      participants: phase.participants,
      cancel: this.schedule(breakEndsAt - now, () => {
        room.phase = { kind: "idle" };
        this.publish(room);
      }),
    };
  }

  /** Someone let go of the rope: the session ends ABANDONED for everyone in it. */
  private slip(room: LiveRoom, displayName: string, reason: "left" | "gave_up" | "disconnected") {
    const phase = room.phase;
    if (phase.kind !== "focus") return;
    phase.cancel();
    const now = this.clock.now();

    this.notify({
      type: "session_ended",
      session: {
        ...this.endedSession(room, phase),
        // During the countdown, focus hasn't started yet: end it where it
        // would have begun, so endedAt is never before startedAt.
        endedAt: new Date(Math.max(now, phase.startsAt)),
        status: "ABANDONED",
      },
    });
    room.lastOutcome = { kind: "slipped", displayName, reason, at: iso(now) };
    room.phase = { kind: "idle" };
  }

  /** The parts of an ended session that don't depend on how it ended. */
  private endedSession(room: LiveRoom, phase: Extract<LivePhase, { kind: "focus" }>) {
    return {
      roomId: room.id,
      sessionId: phase.sessionId,
      plannedMinutes: phase.plannedMinutes,
      startedAt: new Date(phase.startsAt),
      participantIds: [...phase.participants],
    };
  }

  private close(room: LiveRoom): void {
    if (room.phase.kind !== "idle") room.phase.cancel();
    this.rooms.delete(room.id);
    this.notify({ type: "closed", roomId: room.id });
  }

  /** Sends the room's snapshot to its members (unless it just closed). */
  private publish(room: LiveRoom): void {
    if (!this.rooms.has(room.id)) return;
    this.notify({ type: "state", roomId: room.id, state: this.snapshot(room) });
  }

  /** The room as clients see it: plain data, times as ISO strings. */
  private snapshot(room: LiveRoom): RoomState {
    return {
      code: room.code,
      members: [...room.members.values()].map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        isHost: member.userId === room.hostId,
        status: this.statusOf(room, member),
        reconnectBy: member.grace ? iso(member.grace.endsAt) : null,
        climb: member.climb,
      })),
      phase: this.publicPhase(room.phase),
      lastOutcome: room.lastOutcome,
    };
  }

  /**
   * Status is worked out from the facts (connections and the phase) instead
   * of being stored, so it can never drift out of sync with them.
   */
  private statusOf(room: LiveRoom, member: LiveMember): RoomMember["status"] {
    if (member.connections.size === 0) return "disconnected";
    const { phase } = room;
    if (phase.kind === "idle" || !phase.participants.has(member.userId)) return "idle";
    return phase.kind === "focus" ? "focusing" : "on_break";
  }

  private publicPhase(phase: LivePhase): RoomPhase {
    switch (phase.kind) {
      case "idle":
        return { kind: "idle" };
      case "focus":
        return {
          kind: "focus",
          sessionId: phase.sessionId,
          plannedMinutes: phase.plannedMinutes,
          startsAt: iso(phase.startsAt),
          endsAt: iso(phase.endsAt),
        };
      case "break":
        return { kind: "break", endsAt: iso(phase.endsAt) };
    }
  }
}
