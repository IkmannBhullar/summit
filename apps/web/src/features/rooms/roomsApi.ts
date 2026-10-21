/** The room endpoints, as typed functions (signed-in users only). */
import { RoomResponseSchema, type RoomInfo } from "@summit/shared";
import { apiRequest } from "../../lib/api";

/** Creates a room hosted by the signed-in user. */
export async function createRoom(): Promise<RoomInfo> {
  const { room } = await apiRequest("/api/rooms", { method: "POST", schema: RoomResponseSchema });
  return room;
}

/** Looks up an open room. Throws ApiRequestError (404) if there isn't one. */
export async function findRoom(code: string): Promise<RoomInfo> {
  const { room } = await apiRequest(`/api/rooms/${encodeURIComponent(code)}`, {
    schema: RoomResponseSchema,
  });
  return room;
}

/** "K7QM2X" → "K7Q-M2X": easier to read out loud. (Joining accepts either.) */
export function formatRoomCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** The invite: a link straight to the room. */
export function roomInviteLink(code: string, origin = window.location.origin): string {
  return `${origin}/rooms/${code}`;
}
