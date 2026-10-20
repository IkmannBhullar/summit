// Tests for the room service and the rooms table's constraints, against the
// real test database.
import { generateRoomCode, ROOM_CODE_ALPHABET } from "@summit/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrisma, resetDatabase } from "../test/db";
import { createRoomService } from "./rooms";

const prisma = createTestPrisma();

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const createUser = (email = "ana@example.com") =>
  prisma.user.create({ data: { email, passwordHash: "hash", displayName: "Ana" } });

/** A fake randomInt that always picks the same characters: every code is "AAAAAA". */
const alwaysSame = () => 0;

/** A randomInt that returns `first` for the first code, then counts up. */
function sameThenDifferent() {
  let calls = 0;
  return (max: number) => (calls++ < 12 ? 0 : (calls - 12) % max);
}

describe("room service", () => {
  it("creates an open room with a valid code, hosted by the creator", async () => {
    const user = await createUser();
    const rooms = createRoomService(prisma);

    const room = await rooms.create(user.id);

    expect(room.code).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
    expect(room).toMatchObject({ hostId: user.id, closedAt: null });
  });

  it("finds an open room by code, but not a closed one", async () => {
    const user = await createUser();
    const rooms = createRoomService(prisma);
    const room = await rooms.create(user.id);

    expect((await rooms.findOpenByCode(room.code))?.id).toBe(room.id);
    await rooms.close(room.id);
    expect(await rooms.findOpenByCode(room.code)).toBeNull();
  });

  // Collisions are rare with real randomness, so force one.
  it("picks a different code if the first one is taken by an open room", async () => {
    const user = await createUser();
    await createRoomService(prisma, { randomInt: alwaysSame }).create(user.id); // takes AAAAAA

    const second = await createRoomService(prisma, { randomInt: sameThenDifferent() }).create(
      user.id,
    );

    expect(second.code).not.toBe("AAAAAA");
    await expect(prisma.room.count({ where: { closedAt: null } })).resolves.toBe(2);
  });

  it("gives up with an error if every attempt collides", async () => {
    const user = await createUser();
    const rooms = createRoomService(prisma, { randomInt: alwaysSame });
    await rooms.create(user.id);

    await expect(rooms.create(user.id)).rejects.toThrow(/free room code/);
  });

  it("can reuse the code of a closed room", async () => {
    const user = await createUser();
    const rooms = createRoomService(prisma, { randomInt: alwaysSame });
    const first = await rooms.create(user.id);
    await rooms.close(first.id);

    const reused = await rooms.create(user.id);

    expect(reused.code).toBe(first.code);
  });

  it("closes a room only once, keeping the first closing time", async () => {
    const user = await createUser();
    let clock = Date.parse("2026-10-19T09:00:00.000Z");
    const rooms = createRoomService(prisma, { now: () => new Date(clock) });
    const room = await rooms.create(user.id);

    clock += 60 * 60 * 1000;
    await rooms.close(room.id);
    clock += 60 * 60 * 1000;
    await rooms.close(room.id);

    const stored = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(stored.closedAt?.toISOString()).toBe("2026-10-19T10:00:00.000Z");
  });

  it("changes the host", async () => {
    const ana = await createUser();
    const ben = await createUser("ben@example.com");
    const rooms = createRoomService(prisma);
    const room = await rooms.create(ana.id);

    await rooms.setHost(room.id, ben.id);

    await expect(prisma.room.findUniqueOrThrow({ where: { id: room.id } })).resolves.toMatchObject({
      hostId: ben.id,
    });
  });
});

describe("rooms table constraints", () => {
  it("accepts every code the shared generator makes", async () => {
    const user = await createUser();
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode((max) => Math.floor(Math.random() * max));
      const at = new Date();
      await prisma.room.create({ data: { code, hostId: user.id, createdAt: at, closedAt: at } });
    }
    await expect(prisma.room.count()).resolves.toBe(20);
  });

  it.each(["AAAAA0", "aaaaaa", "AAAAA", "AAAAAAA"])(
    "rejects the malformed code %s",
    async (code) => {
      const user = await createUser();

      await expect(prisma.room.create({ data: { code, hostId: user.id } })).rejects.toThrow(
        /rooms_code_format/,
      );
    },
  );

  it("refuses two open rooms with the same code", async () => {
    const user = await createUser();
    await prisma.room.create({ data: { code: "K7QM2X", hostId: user.id } });

    await expect(prisma.room.create({ data: { code: "K7QM2X", hostId: user.id } })).rejects.toThrow(
      /Unique constraint/,
    );
  });

  it("refuses a room that closes before it was created", async () => {
    const user = await createUser();

    await expect(
      prisma.room.create({
        data: {
          code: "K7QM2X",
          hostId: user.id,
          createdAt: new Date("2026-10-19T10:00:00.000Z"),
          closedAt: new Date("2026-10-19T09:00:00.000Z"),
        },
      }),
    ).rejects.toThrow(/rooms_closes_after_creation/);
  });

  it("deletes the rooms a user hosts when their account is deleted", async () => {
    const user = await createUser();
    await prisma.room.create({ data: { code: "K7QM2X", hostId: user.id } });

    await prisma.user.delete({ where: { id: user.id } });

    await expect(prisma.room.count()).resolves.toBe(0);
  });

  // The room is part of history, but each member's session is THEIR history.
  it("keeps members' sessions when a room is deleted, just unlinked", async () => {
    const user = await createUser();
    const room = await prisma.room.create({ data: { code: "K7QM2X", hostId: user.id } });
    const session = await prisma.focusSession.create({
      data: {
        id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
        userId: user.id,
        plannedMinutes: 25,
        startedAt: new Date("2026-10-19T09:00:00.000Z"),
        endedAt: new Date("2026-10-19T09:25:00.000Z"),
        status: "COMPLETED",
        metersGained: 250,
        roomId: room.id,
      },
    });

    await prisma.room.delete({ where: { id: room.id } });

    await expect(
      prisma.focusSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ roomId: null, metersGained: 250 });
  });
});
