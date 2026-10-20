/**
 * Room codes: the 6 characters friends share to join a rope team, e.g. "K7QM2X".
 */
import { z } from "zod";

/**
 * Characters a code may contain. Left out on purpose: 0/O and 1/I/L, which
 * look alike in many fonts and get misread when a code is said out loud.
 * 31 characters ^ 6 positions ≈ 887 million possible codes.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/**
 * Cleans up what someone typed or pasted: removes spaces and dashes and
 * uppercases, so "k7q-m2x" and " K7QM2X " both become "K7QM2X". Also accepts
 * a full invite link (".../rooms/K7QM2X") and keeps only the code.
 */
export function normalizeRoomCode(input: string): string {
  const lastPart = input.trim().split("/").filter(Boolean).at(-1) ?? "";
  return lastPart.replace(/[\s-]/g, "").toUpperCase();
}

/** A valid room code, after normalizing. */
export const RoomCodeSchema = z
  .string()
  .transform(normalizeRoomCode)
  .pipe(
    z.string().regex(CODE_PATTERN, {
      message: `Room codes are ${ROOM_CODE_LENGTH} letters and numbers.`,
    }),
  );

/**
 * Makes a random room code.
 *
 * @param randomInt - Returns a random whole number from 0 to max - 1. The
 *   server passes `crypto.randomInt` (unpredictable, so codes can't be
 *   guessed from earlier ones); tests pass a predictable one.
 */
export function generateRoomCode(randomInt: (max: number) => number): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
