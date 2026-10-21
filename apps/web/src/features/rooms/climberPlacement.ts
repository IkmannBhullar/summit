/**
 * Where each rope team member stands on the shared mountain drawing.
 *
 * Teammates are often on different peaks (Ana on Mt. Fuji, Ben on Mt.
 * Rainier), and meters only mean something on your own peak. So each
 * climber is placed by the FRACTION of their current peak they've climbed:
 * "how close am I to my next summit?". Pure, so it's easy to test.
 */
import { findPeak, type RoomMember } from "@summit/shared";
import { pointAlong, TRAIL, type Point } from "../climb/trail";

/** Sideways gap between climbers standing at the same spot, in SVG units. */
export const FAN_OUT_SPACING = 14;
/** Climbers closer than this (as a fraction of the trail) count as "the same spot". */
const SAME_SPOT = 0.02;

/**
 * One color per climber, matched between the mountain and the member list.
 * Full class names (not built from parts), so Tailwind finds them in the code.
 */
export const CLIMBER_COLORS = [
  { fill: "fill-teal-600", bg: "bg-teal-600" },
  { fill: "fill-amber-500", bg: "bg-amber-500" },
  { fill: "fill-violet-500", bg: "bg-violet-500" },
  { fill: "fill-rose-500", bg: "bg-rose-500" },
  { fill: "fill-sky-500", bg: "bg-sky-500" },
  { fill: "fill-lime-600", bg: "bg-lime-600" },
  { fill: "fill-orange-500", bg: "bg-orange-500" },
  { fill: "fill-fuchsia-500", bg: "bg-fuchsia-500" },
] as const;

/** A member's color: by their place in the list (rooms hold at most 8). */
export const climberColor = (index: number) => CLIMBER_COLORS[index % CLIMBER_COLORS.length]!;

export interface PlacedClimber {
  userId: string;
  /** Their place in the member list (for the color). */
  index: number;
  /** 0 (trailhead) to 1 (summit) on their own current peak. */
  fraction: number;
  point: Point;
}

/** How far up their current peak a member is, from 0 to 1. */
export function climbFraction(climb: RoomMember["climb"]): number {
  const peak = findPeak(climb.peakId);
  if (!peak) return 0; // An unknown peak (a newer server?): start at the bottom.
  return Math.min(1, Math.max(0, climb.metersGained / peak.heightMeters));
}

/**
 * Each member's spot on the trail. Climbers at (almost) the same spot would
 * hide each other, so they're fanned out sideways, centered on the trail.
 */
export function placeClimbers(members: readonly RoomMember[]): PlacedClimber[] {
  const fractions = members.map((member) => climbFraction(member.climb));

  return members.map((member, index) => {
    const fraction = fractions[index]!;
    // Everyone sharing this spot, in list order: where am I among them?
    const sharing = fractions
      .map((other, otherIndex) => ({ other, otherIndex }))
      .filter(({ other }) => Math.abs(other - fraction) < SAME_SPOT)
      .map(({ otherIndex }) => otherIndex);
    const position = sharing.indexOf(index);
    const offset = (position - (sharing.length - 1) / 2) * FAN_OUT_SPACING;

    const onTrail = pointAlong(TRAIL, fraction);
    return {
      userId: member.userId,
      index,
      fraction,
      point: { x: onTrail.x + offset, y: onTrail.y },
    };
  });
}

/** The rope: through every climber, from the lowest to the highest. */
export function ropePoints(placed: readonly PlacedClimber[]): Point[] {
  return placed.toSorted((a, b) => a.fraction - b.fraction).map((climber) => climber.point);
}

const meters = (value: number) => `${value.toLocaleString("en-US")} m`;

/** One sentence for screen readers: where everyone is. */
export function describeTeam(members: readonly RoomMember[]): string {
  const climbers = members.map((member) => {
    const peak = findPeak(member.climb.peakId);
    const height = peak ? ` of ${meters(peak.heightMeters)}` : "";
    return `${member.displayName} at ${meters(member.climb.metersGained)}${height} on ${peak?.name ?? member.climb.peakId}`;
  });
  const count = members.length === 1 ? "1 climber" : `${members.length} climbers`;
  return `Rope team of ${count}: ${climbers.join("; ")}`;
}
