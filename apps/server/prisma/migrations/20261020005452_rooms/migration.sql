-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "host_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written: rules Prisma's schema language can't express.
-- ---------------------------------------------------------------------------

-- Codes are unique among OPEN rooms only. A partial index covers just the
-- rows matching its WHERE clause, so a closed room's code can be reused
-- later, while two open rooms can never share one. It also makes "find the
-- open room with this code" (every join) an index lookup.
CREATE UNIQUE INDEX "rooms_open_code_key"
    ON "rooms" ("code")
    WHERE "closed_at" IS NULL;

-- Same alphabet and length as ROOM_CODE_ALPHABET in packages/shared
-- (no look-alikes such as 0/O or 1/I/L).
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_code_format"
    CHECK ("code" ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_closes_after_creation"
    CHECK ("closed_at" IS NULL OR "closed_at" >= "created_at");
