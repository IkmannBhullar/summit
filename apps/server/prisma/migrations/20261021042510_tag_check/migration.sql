-- Tags must already be tidied, the way the shared normalizeTag/TagSchema
-- leave them: 1 to 32 characters, no whitespace at either end, no runs of
-- whitespace, and spaces only (no tabs or newlines). The API guarantees
-- this; the constraint makes sure nothing else can write a messy tag.
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_tag_tidy"
    CHECK (
        "tag" IS NULL OR (
            char_length("tag") BETWEEN 1 AND 32
            AND "tag" !~ '^\s|\s$|\s\s|[\t\n\r\f\v]'
        )
    );
