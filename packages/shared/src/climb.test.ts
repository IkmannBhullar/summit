// Tests for climb progression. Most use a tiny fake peak list with round
// numbers so the arithmetic is easy to follow; one test uses the real PEAKS.
import { describe, expect, it } from "vitest";
import {
  applyMeters,
  ClimbProgressSchema,
  createInitialProgress,
  getCurrentClimb,
  type ClimbProgress,
} from "./climb";
import { PEAKS, type Peak } from "./peaks";

// Three small test peaks: 100 m, 200 m, 300 m.
const TEST_PEAKS: readonly Peak[] = [
  { id: "hill", name: "Hill", heightMeters: 100, region: "Test", order: 1 },
  { id: "ridge", name: "Ridge", heightMeters: 200, region: "Test", order: 2 },
  { id: "spire", name: "Spire", heightMeters: 300, region: "Test", order: 3 },
];

// A fixed moment, so summit timestamps are predictable.
const NOW = new Date("2026-10-17T12:00:00.000Z");

/** Shortcut: fresh progress on the test peaks. */
const start = (): ClimbProgress => createInitialProgress(TEST_PEAKS);

describe("createInitialProgress", () => {
  it("starts at 0 m on the first peak", () => {
    expect(createInitialProgress()).toEqual({
      climbs: [{ peakId: "mt-fuji", metersGained: 0, summitedAt: null }],
    });
  });

  it("throws if there are no peaks", () => {
    expect(() => createInitialProgress([])).toThrow();
  });
});

describe("getCurrentClimb", () => {
  it("returns the current peak and meters left to the summit", () => {
    const { progress } = applyMeters(start(), 30, NOW, TEST_PEAKS);

    const current = getCurrentClimb(progress, TEST_PEAKS);

    expect(current?.peak.id).toBe("hill");
    expect(current?.climb.metersGained).toBe(30);
    expect(current?.metersToSummit).toBe(70);
  });

  it("returns null once every peak is summited", () => {
    const { progress } = applyMeters(start(), 600, NOW, TEST_PEAKS);

    expect(getCurrentClimb(progress, TEST_PEAKS)).toBeNull();
  });

  it("throws on an unknown peak id (corrupt saved data)", () => {
    const corrupt: ClimbProgress = {
      climbs: [{ peakId: "mt-doom", metersGained: 0, summitedAt: null }],
    };

    expect(() => getCurrentClimb(corrupt, TEST_PEAKS)).toThrow(/mt-doom/);
  });
});

describe("applyMeters", () => {
  it("climbs part of the way without summiting", () => {
    const result = applyMeters(start(), 40, NOW, TEST_PEAKS);

    expect(result.progress.climbs).toEqual([
      { peakId: "hill", metersGained: 40, summitedAt: null },
    ]);
    expect(result.summitedPeaks).toEqual([]);
    expect(result.unusedMeters).toBe(0);
  });

  it("adds up across several sessions", () => {
    let progress = start();
    for (let i = 0; i < 3; i++) {
      progress = applyMeters(progress, 25, NOW, TEST_PEAKS).progress;
    }

    expect(getCurrentClimb(progress, TEST_PEAKS)?.climb.metersGained).toBe(75);
  });

  it("summits on an exact hit and unlocks the next peak at 0 m", () => {
    const result = applyMeters(start(), 100, NOW, TEST_PEAKS);

    expect(result.progress.climbs).toEqual([
      { peakId: "hill", metersGained: 100, summitedAt: NOW.toISOString() },
      { peakId: "ridge", metersGained: 0, summitedAt: null },
    ]);
    expect(result.summitedPeaks.map((peak) => peak.id)).toEqual(["hill"]);
  });

  // Decision 009: extra meters past a summit are not wasted.
  it("carries extra meters over to the next peak", () => {
    const halfway = applyMeters(start(), 90, NOW, TEST_PEAKS).progress;

    const result = applyMeters(halfway, 50, NOW, TEST_PEAKS);

    expect(result.progress.climbs[1]).toEqual({
      peakId: "ridge",
      metersGained: 40,
      summitedAt: null,
    });
  });

  it("can summit more than one peak in a single call", () => {
    const result = applyMeters(start(), 350, NOW, TEST_PEAKS);

    expect(result.summitedPeaks.map((peak) => peak.id)).toEqual(["hill", "ridge"]);
    expect(getCurrentClimb(result.progress, TEST_PEAKS)?.climb.metersGained).toBe(50);
  });

  it("reports meters left over after the final summit", () => {
    const result = applyMeters(start(), 650, NOW, TEST_PEAKS);

    expect(result.summitedPeaks).toHaveLength(3);
    expect(result.unusedMeters).toBe(50);
    expect(result.progress.climbs).toHaveLength(3);
  });

  it("does nothing more once everything is summited", () => {
    const done = applyMeters(start(), 600, NOW, TEST_PEAKS).progress;

    const result = applyMeters(done, 10, NOW, TEST_PEAKS);

    expect(result.progress).toEqual(done);
    expect(result.unusedMeters).toBe(10);
  });

  it("treats 0 meters as a no-op", () => {
    const result = applyMeters(start(), 0, NOW, TEST_PEAKS);

    expect(result.progress).toEqual(start());
    expect(result.summitedPeaks).toEqual([]);
  });

  // React state must never be mutated in place, or the UI won't update.
  it("never modifies the progress object it was given", () => {
    const before = start();
    // Deep copy via JSON: fine for plain data like this. (structuredClone
    // isn't available here because shared code has no browser/Node types.)
    const snapshot: unknown = JSON.parse(JSON.stringify(before));

    applyMeters(before, 150, NOW, TEST_PEAKS);

    expect(before).toEqual(snapshot);
  });

  it.each([-1, 2.5, Number.NaN])("throws RangeError for %s meters", (bad) => {
    expect(() => applyMeters(start(), bad, NOW, TEST_PEAKS)).toThrow(RangeError);
  });

  // The CLAUDE.md example, with the real peaks: Fuji (3,776 m) needs 16
  // 25-minute sessions (15 × 250 = 3,750 m isn't quite enough).
  it("summits Mt. Fuji on the 16th 25-minute session with the real peaks", () => {
    let progress = createInitialProgress();
    for (let session = 1; session <= 15; session++) {
      progress = applyMeters(progress, 250, NOW).progress;
    }
    expect(getCurrentClimb(progress)?.metersToSummit).toBe(26);

    const result = applyMeters(progress, 250, NOW);

    expect(result.summitedPeaks.map((peak) => peak.id)).toEqual(["mt-fuji"]);
    expect(getCurrentClimb(result.progress)?.peak.id).toBe("mt-rainier");
    expect(getCurrentClimb(result.progress)?.climb.metersGained).toBe(224);
    expect(PEAKS[0].heightMeters).toBe(3776);
  });
});

describe("ClimbProgressSchema", () => {
  it("accepts progress produced by applyMeters", () => {
    const { progress } = applyMeters(start(), 150, NOW, TEST_PEAKS);

    expect(ClimbProgressSchema.safeParse(progress).success).toBe(true);
  });

  it.each([
    ["no climbs", { climbs: [] }],
    ["negative meters", { climbs: [{ peakId: "hill", metersGained: -5, summitedAt: null }] }],
    [
      "a non-date summit time",
      { climbs: [{ peakId: "hill", metersGained: 5, summitedAt: "soon" }] },
    ],
    ["the wrong shape", { peaks: "lots" }],
  ])("rejects %s", (_label, bad) => {
    expect(ClimbProgressSchema.safeParse(bad).success).toBe(false);
  });
});
