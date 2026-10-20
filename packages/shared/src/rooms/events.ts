/**
 * The real-time protocol between browser and server (Socket.io events).
 *
 * Socket.io lets each side `emit` named events. Requests from the browser
 * also pass an "acknowledgement" callback, which the server calls with the
 * result, much like an HTTP response, so the client knows whether "start"
 * worked or why not.
 *
 * The interfaces below type both sides: Socket.io accepts them as generics,
 * so `socket.emit("room:jion", ...)` (a typo) is a compile error. The
 * payloads still arrive as untrusted data, so the server validates them with
 * the schemas here.
 */
import { z } from "zod";
import { TIMER_SETTING_LIMITS } from "../settings";
import { RoomCodeSchema } from "./code";
import type { RoomState } from "./state";

/** Why a room request failed. */
export const RoomErrorCodeSchema = z.enum([
  /** The connection has no valid login cookie. */
  "NOT_SIGNED_IN",
  /** No open room has that code. */
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  /** The request needs you to be in the room first. */
  "NOT_IN_ROOM",
  /** Only the host can do that (e.g. start a session). */
  "NOT_HOST",
  /** Not possible while a team session is running. */
  "SESSION_IN_PROGRESS",
  /** The payload failed validation. */
  "INVALID_REQUEST",
]);
export type RoomErrorCode = z.infer<typeof RoomErrorCodeSchema>;

/** What an acknowledgement callback receives: the result, or why it failed. */
export type AckResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: RoomErrorCode; message: string } };

/** "room:join" */
export const JoinRoomPayloadSchema = z.object({ code: RoomCodeSchema });
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;

/** "session:start" (host only). The server sets the times itself. */
export const StartTeamSessionPayloadSchema = z.object({
  plannedMinutes: z
    .number()
    .int()
    .min(TIMER_SETTING_LIMITS.focusMinutes.min)
    .max(TIMER_SETTING_LIMITS.focusMinutes.max),
});
export type StartTeamSessionPayload = z.infer<typeof StartTeamSessionPayloadSchema>;

/** "clock:ping": the client's clock when it sent the ping (ms since epoch). */
export const ClockPingPayloadSchema = z.object({ clientTime: z.number() });
export type ClockPingPayload = z.infer<typeof ClockPingPayloadSchema>;

/** The reply: the client's own time echoed back, plus the server's clock. */
export interface ClockPong {
  clientTime: number;
  serverTime: number;
}

/** Events the browser sends. */
export interface ClientToServerEvents {
  "room:join": (payload: JoinRoomPayload, ack: (result: AckResult<RoomState>) => void) => void;
  "room:leave": (ack: (result: AckResult<null>) => void) => void;
  "session:start": (
    payload: StartTeamSessionPayload,
    ack: (result: AckResult<RoomState>) => void,
  ) => void;
  "session:give_up": (ack: (result: AckResult<RoomState>) => void) => void;
  "clock:ping": (payload: ClockPingPayload, ack: (pong: ClockPong) => void) => void;
}

/** Events the server sends. */
export interface ServerToClientEvents {
  /** The room's complete current state, after any change. */
  "room:state": (state: RoomState) => void;
}
