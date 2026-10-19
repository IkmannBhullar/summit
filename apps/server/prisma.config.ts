// Prisma configuration (Prisma 7+): where the schema and migrations live,
// how to seed, and which database to connect to.
import { defineConfig } from "prisma/config";

// The Prisma CLI doesn't read .env files by itself (since Prisma 7), so load
// apps/server/.env with Node's built-in loader when it exists. In CI and
// production, real environment variables are set instead.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: fine, use the environment as-is.
}

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // `npm run db:seed` (and `prisma migrate reset`) run this to insert the peaks.
    seed: "tsx prisma/seed.ts",
  },
  // Only commands that talk to the database (migrate, seed, studio) need a
  // URL. Leaving it out when unset lets `prisma generate` run anywhere,
  // e.g. in CI before the typecheck.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
