// Tests for room codes.
import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomCodeSchema,
} from "./code";

describe("ROOM_CODE_ALPHABET", () => {
  // These look alike in many fonts, so they'd cause misreads.
  it.each(["0", "O", "1", "I", "L"])("leaves out the look-alike character %s", (char) => {
    expect(ROOM_CODE_ALPHABET).not.toContain(char);
  });

  it("has no repeated characters", () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });
});

describe("normalizeRoomCode", () => {
  it.each([
    ["k7qm2x", "K7QM2X"],
    ["  K7QM2X ", "K7QM2X"],
    ["K7Q-M2X", "K7QM2X"],
    ["k7q m2x", "K7QM2X"],
    // A pasted invite link works too.
    ["https://summit.example/rooms/K7QM2X", "K7QM2X"],
    ["https://summit.example/rooms/k7qm2x/", "K7QM2X"],
  ])("turns %j into %s", (input, expected) => {
    expect(normalizeRoomCode(input)).toBe(expected);
  });
});

describe("RoomCodeSchema", () => {
  it("accepts and normalizes a valid code", () => {
    expect(RoomCodeSchema.parse(" k7q-m2x ")).toBe("K7QM2X");
  });

  it.each([
    ["too short", "K7QM2"],
    ["too long", "K7QM2XA"],
    ["a look-alike zero", "K7QM20"],
    ["a symbol", "K7QM2!"],
    ["empty", ""],
  ])("rejects a code that's %s", (_label, code) => {
    expect(RoomCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe("generateRoomCode", () => {
  it("makes a code of the right length from the alphabet only", () => {
    let i = 0;
    const code = generateRoomCode((max) => i++ % max);

    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    expect(RoomCodeSchema.safeParse(code).success).toBe(true);
  });

  it("maps the random numbers to characters in order", () => {
    const values = [0, 1, 2, 3, 4, 5];

    expect(generateRoomCode(() => values.shift()!)).toBe(ROOM_CODE_ALPHABET.slice(0, 6));
  });

  it("produces valid codes with real randomness, too", () => {
    for (let n = 0; n < 200; n++) {
      const code = generateRoomCode((max) => Math.floor(Math.random() * max));
      expect(RoomCodeSchema.safeParse(code).success).toBe(true);
    }
  });
});
