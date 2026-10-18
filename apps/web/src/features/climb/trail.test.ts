// Tests for the mountain geometry.
import { describe, expect, it } from "vitest";
import { pointAlong, SUMMIT, toPathData, TRAIL, type Point } from "./trail";

// An L-shaped path: 30 units right, then 10 units down (total 40).
const L_SHAPE: Point[] = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 10 },
];

describe("pointAlong", () => {
  it("returns the start at 0 and the end at 1", () => {
    expect(pointAlong(L_SHAPE, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(L_SHAPE, 1)).toEqual({ x: 30, y: 10 });
  });

  // Halfway by distance is 20 units in: still on the first (30-unit) segment.
  it("measures by distance walked, not by corners", () => {
    expect(pointAlong(L_SHAPE, 0.5)).toEqual({ x: 20, y: 0 });
  });

  it("interpolates within later segments", () => {
    // 35 of 40 units: past the corner (30) and 5 down the second segment.
    expect(pointAlong(L_SHAPE, 35 / 40)).toEqual({ x: 30, y: 5 });
  });

  it("clamps fractions outside 0..1", () => {
    expect(pointAlong(L_SHAPE, -2)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(L_SHAPE, 7)).toEqual({ x: 30, y: 10 });
  });

  it("handles a single point", () => {
    expect(pointAlong([{ x: 4, y: 2 }], 0.5)).toEqual({ x: 4, y: 2 });
  });

  it("throws for an empty path", () => {
    expect(() => pointAlong([], 0.5)).toThrow();
  });

  it("ends the real trail exactly at the summit", () => {
    expect(pointAlong(TRAIL, 1)).toEqual(SUMMIT);
  });

  // Climbing higher should never move the climber down the mountain overall.
  it("rises steadily on the real trail", () => {
    const heights = [0, 0.25, 0.5, 0.75, 1].map((f) => pointAlong(TRAIL, f).y);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeLessThan(heights[i - 1]!); // smaller y = higher up
    }
  });
});

describe("toPathData", () => {
  it("builds SVG path commands", () => {
    expect(toPathData(L_SHAPE)).toBe("M0 0 L30 0 L30 10");
  });

  it("closes the shape when asked", () => {
    expect(toPathData(L_SHAPE, true)).toBe("M0 0 L30 0 L30 10 Z");
  });
});
