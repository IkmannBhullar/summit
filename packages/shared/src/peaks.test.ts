// Sanity checks on the seed data. Data has bugs too: a typo here would
// break unlock order or corrupt saved progress, so we test it like code.
import { describe, expect, it } from "vitest";
import { findPeak, PEAKS } from "./peaks";

describe("PEAKS seed data", () => {
  it("has between 6 and 8 peaks", () => {
    expect(PEAKS.length).toBeGreaterThanOrEqual(6);
    expect(PEAKS.length).toBeLessThanOrEqual(8);
  });

  it("has unique ids", () => {
    const ids = PEAKS.map((peak) => peak.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Ids are stored in users' progress, so they must be safe in URLs and stable.
  it("uses lowercase kebab-case ids", () => {
    for (const peak of PEAKS) {
      expect(peak.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("numbers `order` 1, 2, 3… with no gaps, matching array position", () => {
    PEAKS.forEach((peak, index) => {
      expect(peak.order).toBe(index + 1);
    });
  });

  // Each new peak should be a bigger challenge than the last.
  it("gets strictly higher with each peak", () => {
    for (let i = 1; i < PEAKS.length; i++) {
      // `!` is safe: the loop bounds guarantee both indexes exist.
      expect(PEAKS[i]!.heightMeters).toBeGreaterThan(PEAKS[i - 1]!.heightMeters);
    }
  });

  // Anchors the example from CLAUDE.md so it can't silently drift.
  it("lists Mt. Rainier at 4,392 m", () => {
    expect(findPeak("mt-rainier")?.heightMeters).toBe(4392);
  });
});

describe("findPeak", () => {
  it("returns undefined for an unknown id", () => {
    expect(findPeak("mt-doom")).toBeUndefined();
  });
});
