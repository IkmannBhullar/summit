/**
 * Database helpers for tests.
 *
 * Every test file that touches the database gets one client and calls
 * resetDatabase() before each test, so tests never see each other's data.
 * (Peaks are seed data, not test data, so they're kept.)
 */
import { createPrismaClient, type PrismaClient } from "../db/client";
import { TEST_DATABASE_URL } from "./config";

export function createTestPrisma(): PrismaClient {
  return createPrismaClient(TEST_DATABASE_URL);
}

/** Empties the tables tests write to. CASCADE also clears rows that reference users. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "focus_sessions", "users" CASCADE');
}
