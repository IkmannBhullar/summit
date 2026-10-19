-- At most ONE running session per user, enforced by Postgres itself.
--
-- A plain UNIQUE index on user_id would forbid a user having more than one
-- session at all. A *partial* index only covers rows matching its WHERE
-- clause, so it's unique among RUNNING sessions and ignores finished ones.
-- Prisma's schema language can't express partial indexes, so this migration
-- is written by hand.
CREATE UNIQUE INDEX "focus_sessions_one_running_per_user"
    ON "focus_sessions" ("user_id")
    WHERE "status" = 'RUNNING';
