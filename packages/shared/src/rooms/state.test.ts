// Tests for the room state and event payload schemas.
import { describe, expect, it } from "vitest";
import {
  ClockPingPayloadSchema,
  JoinRoomPayloadSchema,
  StartTeamSessionPayloadSchema,
} from "./events";
import { RoomStateSchema, type RoomMember, type RoomState } from "./state";

const member = (overrides: Partial<RoomMember> = {}): RoomMember => ({
  userId: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
  displayName: "Ana",
  isHost: true,
  status: "idle",
  reconnectBy: null,
  climb: { peakId: "mt-fuji", metersGained: 250 },
  ...overrides,
});

const ben = member({
  userId: "1c8d6e2f-9a5b-4d4c-8e3f-2b7a8c9d0e1f",
  displayName: "Ben",
  isHost: false,
});

const room = (overrides: Partial<RoomState> = {}): RoomState => ({
  code: "K7QM2X",
  members: [member(), ben],
  phase: { kind: "idle" },
  lastOutcome: null,
  ...overrides,
});

describe("RoomStateSchema", () => {
  it("accepts an idle room", () => {
    expect(RoomStateSchema.safeParse(room()).success).toBe(true);
  });

  it("accepts a room mid-session, with a disconnected member", () => {
    const state = room({
      members: [
        member({ status: "focusing" }),
        { ...ben, status: "disconnected", reconnectBy: "2026-10-19T09:05:15.000Z" },
      ],
      phase: {
        kind: "focus",
        sessionId: "22222222-3333-4444-8555-666666666666",
        plannedMinutes: 25,
        startsAt: "2026-10-19T09:00:03.000Z",
        endsAt: "2026-10-19T09:25:03.000Z",
      },
    });

    expect(RoomStateSchema.safeParse(state).success).toBe(true);
  });

  it("accepts both kinds of outcome", () => {
    for (const lastOutcome of [
      { kind: "completed" as const, metersEach: 250, at: "2026-10-19T09:25:03.000Z" },
      {
        kind: "slipped" as const,
        displayName: "Ben",
        reason: "disconnected" as const,
        at: "2026-10-19T09:10:00.000Z",
      },
    ]) {
      expect(RoomStateSchema.safeParse(room({ lastOutcome })).success).toBe(true);
    }
  });

  it.each([
    ["no host", [member({ isHost: false }), ben]],
    ["two hosts", [member(), { ...ben, isHost: true }]],
    ["more than 8 members", Array.from({ length: 9 }, (_, i) => member({ isHost: i === 0 }))],
  ])("rejects a room with %s", (_label, members) => {
    expect(RoomStateSchema.safeParse(room({ members })).success).toBe(false);
  });

  it("rejects an unknown member status", () => {
    const state = { ...room(), members: [{ ...member(), status: "napping" }] };

    expect(RoomStateSchema.safeParse(state).success).toBe(false);
  });
});

describe("event payloads (untrusted, from the browser)", () => {
  it("normalizes the code in a join request", () => {
    expect(JoinRoomPayloadSchema.parse({ code: " k7q-m2x " })).toEqual({ code: "K7QM2X" });
  });

  it("rejects a join request with an invalid code", () => {
    expect(JoinRoomPayloadSchema.safeParse({ code: "nope" }).success).toBe(false);
  });

  // The host only says how long; the server picks the times.
  it("drops start/end times sent with a start request", () => {
    expect(
      StartTeamSessionPayloadSchema.parse({
        plannedMinutes: 25,
        startsAt: "2020-01-01T00:00:00.000Z",
        endsAt: "2020-01-01T00:00:01.000Z",
      }),
    ).toEqual({ plannedMinutes: 25 });
  });

  it.each([0, 121, 2.5])("rejects a start request for %s minutes", (plannedMinutes) => {
    expect(StartTeamSessionPayloadSchema.safeParse({ plannedMinutes }).success).toBe(false);
  });

  it("requires a numeric client time in a clock ping", () => {
    expect(ClockPingPayloadSchema.safeParse({ clientTime: "now" }).success).toBe(false);
  });
});
