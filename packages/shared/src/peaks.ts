/**
 * The seeded list of real mountains a user climbs, in unlock order.
 *
 * This is the single source of truth: the web app reads it now, and in
 * Phase 2 the server's database seed script will insert these same rows.
 * That's why each peak has a stable string `id`: it must never change once
 * real users have progress saved against it.
 */

/** A real mountain (or base camp) that can be climbed in Summit. */
export interface Peak {
  /** Stable, URL-safe identifier, e.g. "mt-fuji". Never rename one. */
  id: string;
  /** Display name. */
  name: string;
  /** Height above sea level, in meters. Climbing it means gaining this many meters. */
  heightMeters: number;
  /** Where in the world it is, for display. */
  region: string;
  /** Unlock order, starting at 1. */
  order: number;
}

/**
 * Peaks in unlock order, from lowest to highest.
 *
 * Heights are the commonly published figures. Mont Blanc's summit is an ice
 * cap whose measured height changes slightly every survey, so we use the
 * rounded 4,806 m.
 *
 * `as const satisfies` keeps the exact literal values (handy for tests and
 * autocompletion) while still checking that every entry matches `Peak`.
 */
export const PEAKS = [
  { id: "mt-fuji", name: "Mt. Fuji", heightMeters: 3776, region: "Honshu, Japan", order: 1 },
  {
    id: "mt-rainier",
    name: "Mt. Rainier",
    heightMeters: 4392,
    region: "Washington, USA",
    order: 2,
  },
  {
    id: "mont-blanc",
    name: "Mont Blanc",
    heightMeters: 4806,
    region: "Alps, France / Italy",
    order: 3,
  },
  {
    id: "everest-base-camp",
    name: "Everest Base Camp",
    heightMeters: 5364,
    region: "Khumbu, Nepal",
    order: 4,
  },
  {
    id: "kilimanjaro",
    name: "Kilimanjaro",
    heightMeters: 5895,
    region: "Tanzania",
    order: 5,
  },
  { id: "denali", name: "Denali", heightMeters: 6190, region: "Alaska, USA", order: 6 },
  {
    id: "aconcagua",
    name: "Aconcagua",
    heightMeters: 6961,
    region: "Andes, Argentina",
    order: 7,
  },
  {
    id: "mt-everest",
    name: "Mt. Everest",
    heightMeters: 8849,
    region: "Himalaya, Nepal / China",
    order: 8,
  },
] as const satisfies readonly Peak[];

/**
 * Looks up a peak by id.
 *
 * @returns The peak, or `undefined` if no peak has that id (e.g. stale saved data).
 */
export function findPeak(peakId: string, peaks: readonly Peak[] = PEAKS): Peak | undefined {
  return peaks.find((peak) => peak.id === peakId);
}
