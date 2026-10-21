/**
 * A stand-in for the live room connection in tests. The test plays the
 * server: it decides every reply (`replies`) and pushes events (`emit`).
 */
import type { ClockPong, RoomMember, RoomState } from "@summit/shared";
import type { ConnectionEvent, RoomConnection, RoomResult } from "../features/rooms/roomConnection";

export const ANA_ID = "11111111-1111-4111-8111-111111111111";
export const BEN_ID = "22222222-2222-4222-8222-222222222222";

/** A room member, idle on Mt. Fuji unless overridden. */
export function makeMember(overrides: Partial<RoomMember> = {}): RoomMember {
  return {
    userId: ANA_ID,
    displayName: "Ana",
    isHost: true,
    status: "idle",
    reconnectBy: null,
    climb: { peakId: "mt-fuji", metersGained: 0 },
    ...overrides,
  };
}

/** A valid room snapshot: Ana alone and idle, unless overridden. */
export function makeRoomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    code: "K7QM2X",
    members: [makeMember()],
    phase: { kind: "idle" },
    lastOutcome: null,
    ...overrides,
  };
}

const ok = <T>(data: T): Promise<RoomResult<T>> => Promise.resolve({ ok: true, data });

export class FakeRoomConnection implements RoomConnection {
  isOpen = false;
  /** Every request in order, e.g. ["join K7QM2X", "ping", "start 25"]. */
  requests: string[] = [];
  private listeners = new Set<(event: ConnectionEvent) => void>();

  /** How the "server" answers. Replace one to change it for a test. */
  replies = {
    join: (code: string) => ok(makeRoomState({ code })),
    leave: () => ok(null),
    startSession: (_plannedMinutes: number) => ok(makeRoomState()),
    giveUp: () => ok(makeRoomState()),
    // A server clock 5 seconds ahead of this device.
    ping: (clientTime: number): Promise<ClockPong> =>
      Promise.resolve({ clientTime, serverTime: clientTime + 5_000 }),
  };

  /** Sends an event to everyone subscribed, like the real socket would. */
  emit(event: ConnectionEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  // Arrow functions, so they still work when passed around on their own
  // (useRoom hands `connection.ping` to measureClockOffset).
  open = () => {
    this.isOpen = true;
  };

  /** Like Socket.io: closing an open connection reports a disconnect. */
  close = () => {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.emit({ type: "disconnected", willReconnect: false });
  };

  subscribe = (listener: (event: ConnectionEvent) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  join = (code: string) => {
    this.requests.push(`join ${code}`);
    return this.replies.join(code);
  };
  leave = () => {
    this.requests.push("leave");
    return this.replies.leave();
  };
  startSession = (plannedMinutes: number) => {
    this.requests.push(`start ${plannedMinutes}`);
    return this.replies.startSession(plannedMinutes);
  };
  giveUp = () => {
    this.requests.push("give up");
    return this.replies.giveUp();
  };
  ping = (clientTime: number) => {
    this.requests.push("ping");
    return this.replies.ping(clientTime);
  };
}
