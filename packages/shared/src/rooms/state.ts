/**
 * The shape of a rope team room, as the server sends it to every member.
 *
 * The server sends a complete snapshot (`RoomState`) whenever anything
 * changes. Rooms are small (at most 8 members), so this costs little, and a
 * client is always correct after the latest message, even right after
 * reconnecting, with no "missed an update" bugs.
 */
import { z } from "zod";
import { TIMER_SETTING_LIMITS } from "../settings";
import { RoomCodeSchema } from "./code";

/** The most people in one rope team. */
export const ROOM_MAX_MEMBERS = 8;
/** How long a disconnected member has to come back before the team slips. */
export const RECONNECT_GRACE_MS = 15_000;
/** The "3, 2, 1" before a team session starts, so everyone begins together. */
export const START_COUNTDOWN_MS = 3_000;
/** Break length after a completed team session. */
export const TEAM_BREAK_MINUTES = 5;

/** What each member is doing right now. */
export const MemberStatusSchema = z.enum(["idle", "focusing", "on_break", "disconnected"]);
export type MemberStatus = z.infer<typeof MemberStatusSchema>;

export const RoomMemberSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  isHost: z.boolean(),
  status: MemberStatusSchema,
  /** For a disconnected member: when the grace period runs out (ISO time). */
  reconnectBy: z.iso.datetime().nullable(),
  /** Their own climb, for the team mountain: current peak and meters on it. */
  climb: z.object({ peakId: z.string(), metersGained: z.number().int().nonnegative() }),
});
export type RoomMember = z.infer<typeof RoomMemberSchema>;

/**
 * What the room is doing. During "focus", if `startsAt` is still in the
 * future, clients show the countdown.
 */
export const RoomPhaseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("idle") }),
  z.object({
    kind: z.literal("focus"),
    /** Id of the team session (each member's saved session gets its own id). */
    sessionId: z.uuid(),
    plannedMinutes: z
      .number()
      .int()
      .min(TIMER_SETTING_LIMITS.focusMinutes.min)
      .max(TIMER_SETTING_LIMITS.focusMinutes.max),
    /** Set by the SERVER, a few seconds ahead, so everyone starts together. */
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  }),
  z.object({ kind: z.literal("break"), endsAt: z.iso.datetime() }),
]);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

/** How the most recent team session ended, for the message everyone sees. */
export const RoomOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("completed"),
    /** Meters every member earned. */
    metersEach: z.number().int().nonnegative(),
    at: z.iso.datetime(),
  }),
  z.object({
    kind: z.literal("slipped"),
    /** Who caused it (shown as "Ben left, so the rope team slipped"). */
    displayName: z.string(),
    reason: z.enum(["left", "gave_up", "disconnected"]),
    at: z.iso.datetime(),
  }),
]);
export type RoomOutcome = z.infer<typeof RoomOutcomeSchema>;

export const RoomStateSchema = z
  .object({
    code: RoomCodeSchema,
    members: z.array(RoomMemberSchema).max(ROOM_MAX_MEMBERS),
    phase: RoomPhaseSchema,
    lastOutcome: RoomOutcomeSchema.nullable(),
  })
  // A room with members always has exactly one host.
  .refine(
    (room) =>
      room.members.length === 0 || room.members.filter((member) => member.isHost).length === 1,
    { message: "A room needs exactly one host", path: ["members"] },
  );
export type RoomState = z.infer<typeof RoomStateSchema>;
