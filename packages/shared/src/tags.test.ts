// Tests for the shared tag rules.
import { describe, expect, it } from "vitest";
import { FocusSessionSchema } from "./session";
import { normalizeTag, recentTags, resolveTag, sameTag, TagSchema } from "./tags";

describe("normalizeTag", () => {
  it("trims and squeezes whitespace", () => {
    expect(normalizeTag("  Leet   Code \n")).toBe("Leet Code");
  });
});

describe("TagSchema", () => {
  it("accepts a tidied tag of 1 to 32 characters", () => {
    expect(TagSchema.parse(" AWS ")).toBe("AWS");
    expect(TagSchema.parse("x".repeat(32))).toHaveLength(32);
  });

  it("refuses empty or too-long tags", () => {
    expect(TagSchema.safeParse("   ").success).toBe(false);
    expect(TagSchema.safeParse("x".repeat(33)).success).toBe(false);
  });

  // The length counts after tidying, so padding can't sneak past the limit.
  it("measures the tidied tag", () => {
    expect(TagSchema.parse(`  ${"x".repeat(32)}  `)).toHaveLength(32);
  });

  it("is what saved sessions use", () => {
    const session = FocusSessionSchema.parse({
      id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
      plannedMinutes: 25,
      startedAt: "2026-10-20T09:00:00.000Z",
      endedAt: "2026-10-20T09:25:00.000Z",
      status: "COMPLETED",
      tag: "  Leet  Code ",
      metersGained: 250,
      roomId: null,
    });
    expect(session.tag).toBe("Leet Code");
  });
});

describe("sameTag and resolveTag", () => {
  it("treats letter case as the same tag", () => {
    expect(sameTag("leetcode", "LeetCode")).toBe(true);
    expect(sameTag("AWS", "AWS ")).toBe(false); // compare tidied tags
  });

  it("reuses the spelling of a tag already in use", () => {
    expect(resolveTag(" leetcode ", ["AWS", "LeetCode"])).toBe("LeetCode");
  });

  it("keeps a new tag as typed (tidied), and turns blank into no tag", () => {
    expect(resolveTag("System  design", ["AWS"])).toBe("System design");
    expect(resolveTag("   ", ["AWS"])).toBeNull();
  });
});

describe("recentTags", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 9, minute)).toISOString();

  it("lists distinct tags, most recently used first, keeping the newest spelling", () => {
    const sessions = [
      { tag: "aws", startedAt: at(1) },
      { tag: "LeetCode", startedAt: at(2) },
      { tag: null, startedAt: at(3) },
      { tag: "AWS", startedAt: at(4) },
    ];

    expect(recentTags(sessions)).toEqual(["AWS", "LeetCode"]);
  });

  it("stops at the limit", () => {
    const sessions = ["a", "b", "c"].map((tag, i) => ({ tag, startedAt: at(i) }));

    expect(recentTags(sessions, 2)).toEqual(["c", "b"]);
  });
});
