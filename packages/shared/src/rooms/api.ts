/**
 * HTTP endpoints for rooms. Creating and looking up a room are plain
 * request/response, so they're REST. Being *in* a room (live members, the
 * running session) happens over the socket (events.ts).
 *
 *   POST /api/rooms          create a room you host  → 201 RoomResponse
 *   GET  /api/rooms/:code    is this an open room?   → 200 RoomResponse, or 404
 */
import { z } from "zod";
import { RoomCodeSchema } from "./code";

export const RoomInfoSchema = z.object({
  code: RoomCodeSchema,
  createdAt: z.iso.datetime(),
});
export type RoomInfo = z.infer<typeof RoomInfoSchema>;

export const RoomResponseSchema = z.object({ room: RoomInfoSchema });
export type RoomResponse = z.infer<typeof RoomResponseSchema>;
