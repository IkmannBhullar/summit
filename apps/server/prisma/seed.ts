/**
 * Seeds the peaks table from PEAKS in packages/shared (the source of truth).
 *
 * Run with `npm run db:seed -w apps/server`. Safe to run any number of
 * times: each peak is "upserted" (inserted if missing, updated if it already
 * exists), so re-running never creates duplicates and picks up edits.
 */
import { PEAKS } from "@summit/shared";
import { createPrismaClient, type PrismaClient } from "../src/db/client";

/** Inserts or updates every peak. Exported so tests can seed their database too. */
export async function seedPeaks(prisma: PrismaClient): Promise<number> {
  for (const peak of PEAKS) {
    const data = {
      name: peak.name,
      heightMeters: peak.heightMeters,
      region: peak.region,
      order: peak.order,
    };
    await prisma.peak.upsert({
      where: { id: peak.id },
      create: { id: peak.id, ...data },
      update: data,
    });
  }
  return PEAKS.length;
}

// Only run when executed directly (`tsx prisma/seed.ts`), not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set (see apps/server/.env.example).");
    process.exit(1);
  }
  const prisma = createPrismaClient(databaseUrl);
  try {
    const count = await seedPeaks(prisma);
    console.log(`Seeded ${count} peaks.`);
  } finally {
    // Close the connection pool so the script can exit.
    await prisma.$disconnect();
  }
}
