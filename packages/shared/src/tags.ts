/**
 * Tags: optional labels on focus sessions, like "LeetCode" or "AWS", used to
 * see where your focus time goes (stats, Phase 4).
 *
 * The same rules run in the browser (the picker), on the server (the API),
 * and in the database (a CHECK constraint mirrors them).
 */
import { z } from "zod";

export const TAG_MAX_LENGTH = 32;
/** How many recently used tags the picker offers. */
export const RECENT_TAGS_LIMIT = 8;

/**
 * Tidies what someone typed: trims the ends and squeezes any run of
 * whitespace (spaces, tabs, newlines) into one space.
 * "  Leet   Code " → "Leet Code".
 */
export function normalizeTag(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/** A valid tag, after normalizing: 1 to 32 characters. */
export const TagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(
    z
      .string()
      .min(1, { message: "Enter a tag." })
      .max(TAG_MAX_LENGTH, { message: `Tags are at most ${TAG_MAX_LENGTH} characters.` }),
  );

/**
 * Tags are the same regardless of letter case: "leetcode" and "LeetCode"
 * are one tag. (The server compares with SQL's lower() the same way.)
 */
export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * What someone typed, as the tag to save: null for nothing, otherwise
 * normalized, reusing the spelling of a tag they already use, so "leetcode"
 * becomes their existing "LeetCode" and stats don't split it in two.
 */
export function resolveTag(input: string, known: readonly string[]): string | null {
  const tag = normalizeTag(input);
  if (tag === "") return null;
  return known.find((existing) => sameTag(existing, tag)) ?? tag;
}

/**
 * The most recently used distinct tags, newest first (case-insensitively
 * distinct, keeping each tag's most recent spelling).
 */
export function recentTags(
  sessions: readonly { tag: string | null; startedAt: string }[],
  limit = RECENT_TAGS_LIMIT,
): string[] {
  const newestFirst = sessions
    .filter((session): session is { tag: string; startedAt: string } => session.tag !== null)
    .toSorted((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  const tags: string[] = [];
  for (const { tag } of newestFirst) {
    if (!tags.some((seen) => sameTag(seen, tag))) tags.push(tag);
    if (tags.length === limit) break;
  }
  return tags;
}
