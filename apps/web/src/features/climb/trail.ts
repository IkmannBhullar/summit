/**
 * Geometry for the mountain drawing: the mountain's outline and the
 * switchback trail the climber follows from base to summit.
 *
 * Coordinates are in SVG units inside a 400 × 260 viewBox; y grows downward,
 * so a smaller y is higher up the mountain.
 */

export interface Point {
  x: number;
  y: number;
}

/** The drawing's coordinate space. */
export const VIEW_BOX = { width: 400, height: 260 } as const;

/** The summit's position: the top of the mountain and the end of the trail. */
export const SUMMIT: Point = { x: 200, y: 30 };

/**
 * The mountain's outline (a closed shape), left to right. It starts and ends
 * at the bottom corners so the mountain reaches the bottom edge, with no
 * strip of sky under it.
 */
export const MOUNTAIN_OUTLINE: readonly Point[] = [
  { x: 0, y: VIEW_BOX.height },
  { x: 0, y: 240 },
  { x: 60, y: 190 },
  { x: 95, y: 205 },
  { x: 150, y: 110 },
  { x: 175, y: 125 },
  SUMMIT,
  { x: 228, y: 95 },
  { x: 250, y: 85 },
  { x: 300, y: 160 },
  { x: 330, y: 150 },
  { x: 400, y: 240 },
  { x: 400, y: VIEW_BOX.height },
];

/** The snow cap near the summit. */
export const SNOW_CAP: readonly Point[] = [
  SUMMIT,
  { x: 187, y: 80 },
  { x: 194, y: 74 },
  { x: 201, y: 84 },
  { x: 209, y: 75 },
  { x: 221, y: 80 },
];

/** Switchbacks from the trailhead (bottom) to the summit, all inside the outline. */
export const TRAIL: readonly Point[] = [
  { x: 200, y: 238 },
  { x: 150, y: 215 },
  { x: 250, y: 190 },
  { x: 170, y: 165 },
  { x: 235, y: 140 },
  { x: 185, y: 115 },
  { x: 220, y: 90 },
  { x: 195, y: 65 },
  { x: 205, y: 45 },
  SUMMIT,
];

/** Distance between two points (Pythagoras). */
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * The point a given fraction of the way along a path of straight segments,
 * measured by distance walked (not by number of corners).
 *
 * @param fraction - 0 is the first point, 1 the last; values outside are clamped.
 */
export function pointAlong(points: readonly Point[], fraction: number): Point {
  const first = points[0];
  if (!first) throw new Error("pointAlong needs at least one point");
  const last = points.at(-1)!;

  // Return the ends exactly. Computing them would add up square roots, and
  // floating-point rounding could land a hair off (30.00000000000002).
  if (fraction <= 0) return first;
  if (fraction >= 1) return last;

  const lengths = points.slice(1).map((point, i) => distance(points[i]!, point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = fraction * total;

  // Walk the segments until the remaining distance falls inside one.
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    const start = points[i]!;
    const end = points[i + 1]!;
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length; // how far along this segment
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    }
    remaining -= length;
  }
  return last;
}

/** SVG path data for a list of points, e.g. "M0 240 L60 190 …". */
export function toPathData(points: readonly Point[], closed = false): string {
  const commands = points.map((point, i) => `${i === 0 ? "M" : "L"}${point.x} ${point.y}`);
  return commands.join(" ") + (closed ? " Z" : "");
}
