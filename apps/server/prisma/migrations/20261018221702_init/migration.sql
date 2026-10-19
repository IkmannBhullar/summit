-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('PLANNED', 'RUNNING', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peaks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "height_meters" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "peaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "planned_minutes" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "status" "session_status" NOT NULL,
    "tag" TEXT,
    "meters_gained" INTEGER NOT NULL DEFAULT 0,
    "room_id" UUID,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "peaks_order_key" ON "peaks"("order");

-- CreateIndex
CREATE INDEX "focus_sessions_user_id_started_at_id_idx" ON "focus_sessions"("user_id", "started_at" DESC, "id");

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written CHECK constraints. Prisma's schema language can't express
-- these, so they're added here. They're defense in depth: the API already
-- validates everything, but the database itself refuses impossible data,
-- whatever code (or person) writes it.
-- ---------------------------------------------------------------------------

-- Emails are stored normalized, so the unique index means "one account per address".
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase"
    CHECK ("email" = lower("email"));

ALTER TABLE "peaks" ADD CONSTRAINT "peaks_height_positive"
    CHECK ("height_meters" > 0);
ALTER TABLE "peaks" ADD CONSTRAINT "peaks_order_positive"
    CHECK ("order" >= 1);

-- Same limits as TIMER_SETTING_LIMITS.focusMinutes in packages/shared.
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_planned_minutes_range"
    CHECK ("planned_minutes" BETWEEN 1 AND 120);

ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_meters_nonnegative"
    CHECK ("meters_gained" >= 0);

-- Only completed sessions earn elevation.
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_meters_only_when_completed"
    CHECK ("status" = 'COMPLETED' OR "meters_gained" = 0);

-- Finished sessions have an end time; unfinished ones don't.
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_ended_at_matches_status"
    CHECK (("status" IN ('COMPLETED', 'ABANDONED')) = ("ended_at" IS NOT NULL));

ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_ends_after_start"
    CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");
