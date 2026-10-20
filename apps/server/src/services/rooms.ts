/**
 * Rooms as stored in the database: creating them, finding open ones by code,
 * changing the host, and closing them. (Who's connected right now, and the
 * running session, live in server memory; see the room manager.)
 */
import { generateRoomCode, type RoomInfo } from "@summit/shared";
import { randomInt as cryptoRandomInt } from "node:crypto";
import type { PrismaClient } from "../db/client";
import { Prisma, type Room } from "../generated/prisma/client";

/** How many fresh codes to try if the random one is already taken by an open room. */
const MAX_CODE_ATTEMPTS = 5;

export interface RoomService {
  /** Creates an open room hosted by `hostId`, with a new random code. */
  create: (hostId: string) => Promise<Room>;
  /** The OPEN room with this (normalized) code, or null. */
  findOpenByCode: (code: string) => Promise<Room | null>;
  setHost: (roomId: string, hostId: string) => Promise<void>;
  /** Marks a room closed; its code may then be reused by a new room. */
  close: (roomId: string) => Promise<void>;
}

/** The public shape of a room for the REST API. */
export function toRoomInfo(room: Room): RoomInfo {
  return { code: room.code, createdAt: room.createdAt.toISOString() };
}

/**
 * @param options.randomInt - Randomness for codes. Defaults to Node's
 *   cryptographically secure `crypto.randomInt`, so codes can't be predicted;
 *   tests inject a fixed sequence to force collisions.
 * @param options.now - The clock for createdAt and closedAt, injectable for tests.
 */
export function createRoomService(
  prisma: PrismaClient,
  {
    randomInt = cryptoRandomInt,
    now = () => new Date(),
  }: { randomInt?: (max: number) => number; now?: () => Date } = {},
): RoomService {
  return {
    async create(hostId) {
      for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
        try {
          // createdAt comes from OUR clock (not the column's default), so it
          // and closedAt are measured by the same clock and compare sensibly.
          return await prisma.room.create({
            data: { code: generateRoomCode(randomInt), hostId, createdAt: now() },
          });
        } catch (error) {
          // P2002: the code is already used by an open room (the partial
          // unique index). Rare (about 1 in 887 million per open room), so
          // just try another code. Letting the database decide avoids the
          // race in "check if taken, then insert".
          const isCollision =
            error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
          if (!isCollision) throw error;
        }
      }
      throw new Error(`Couldn't find a free room code after ${MAX_CODE_ATTEMPTS} attempts`);
    },

    findOpenByCode: (code) => prisma.room.findFirst({ where: { code, closedAt: null } }),

    async setHost(roomId, hostId) {
      await prisma.room.update({ where: { id: roomId }, data: { hostId } });
    },

    async close(roomId) {
      // Only close it once: an already-closed room keeps its original time.
      await prisma.room.updateMany({
        where: { id: roomId, closedAt: null },
        data: { closedAt: now() },
      });
    },
  };
}
