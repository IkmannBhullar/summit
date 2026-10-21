// Tests for placing rope team members on the shared mountain.
import { describe, expect, it } from "vitest";
import { BEN_ID, makeMember } from "../../test/fakeRoomConnection";
import { pointAlong, SUMMIT, TRAIL } from "../climb/trail";
import {
  climberColor,
  climbFraction,
  CLIMBER_COLORS,
  FAN_OUT_SPACING,
  placeClimbers,
  ropePoints,
} from "./climberPlacement";

const CAL_ID = "33333333-3333-4333-8333-333333333333";
const on = (peakId: string, metersGained: number) => ({ peakId, metersGained });

describe("climbFraction", () => {
  // Same meters, different peaks: further along on the smaller one.
  it("measures progress against the climber's own peak", () => {
    expect(climbFraction(on("mt-fuji", 1_888))).toBe(0.5); // 3,776 m tall
    expect(climbFraction(on("mt-rainier", 1_888))).toBeCloseTo(1_888 / 4_392);
  });

  it("stays between the trailhead and the summit", () => {
    expect(climbFraction(on("mt-fuji", 10_000))).toBe(1);
    expect(climbFraction(on("no-such-peak", 500))).toBe(0);
  });
});

describe("placeClimbers", () => {
  it("puts a climber on the trail at their fraction", () => {
    const [ana] = placeClimbers([makeMember({ climb: on("mt-fuji", 1_888) })]);

    expect(ana?.point).toEqual(pointAlong(TRAIL, 0.5));
  });

  it("puts a finished climb on the summit", () => {
    const [ana] = placeClimbers([makeMember({ climb: on("mt-fuji", 3_776) })]);

    expect(ana?.point).toEqual(SUMMIT);
  });

  // New teammates all start at 0 m: without this they'd be one dot.
  it("fans out climbers at the same spot, centered on the trail", () => {
    const placed = placeClimbers([
      makeMember(),
      makeMember({ userId: BEN_ID, displayName: "Ben" }),
      makeMember({ userId: CAL_ID, displayName: "Cal" }),
    ]);

    const trailhead = TRAIL[0]!;
    expect(placed.map((c) => c.point.x)).toEqual([
      trailhead.x - FAN_OUT_SPACING,
      trailhead.x,
      trailhead.x + FAN_OUT_SPACING,
    ]);
    expect(new Set(placed.map((c) => c.point.y))).toEqual(new Set([trailhead.y]));
  });

  it("leaves climbers at different spots where they are", () => {
    const placed = placeClimbers([
      makeMember({ climb: on("mt-fuji", 0) }),
      makeMember({ userId: BEN_ID, climb: on("mt-fuji", 1_888) }),
    ]);

    expect(placed.map((c) => c.point)).toEqual([pointAlong(TRAIL, 0), pointAlong(TRAIL, 0.5)]);
  });
});

describe("ropePoints", () => {
  it("runs from the lowest climber to the highest, whatever the list order", () => {
    const placed = placeClimbers([
      makeMember({ climb: on("mt-fuji", 3_000) }),
      makeMember({ userId: BEN_ID, climb: on("mt-fuji", 500) }),
    ]);

    expect(ropePoints(placed)).toEqual([placed[1]?.point, placed[0]?.point]);
  });
});

describe("climberColor", () => {
  it("gives each of up to 8 climbers a different color", () => {
    const colors = Array.from({ length: 8 }, (_, i) => climberColor(i).fill);

    expect(new Set(colors).size).toBe(CLIMBER_COLORS.length);
  });
});
