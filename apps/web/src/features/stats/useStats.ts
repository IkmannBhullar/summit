/** Loading the signed-in user's stats from the API. */
import { StatsResponseSchema, type Stats } from "@summit/shared";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";

/** The cache key. Finishing a session invalidates everything under ["stats"]. */
export const STATS_KEY = ["stats"] as const;

/** This device's time zone, e.g. "America/Vancouver" (what the server groups days by). */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export async function fetchStats(timeZone: string): Promise<Stats> {
  const query = new URLSearchParams({ tz: timeZone });
  const { stats } = await apiRequest(`/api/stats?${query}`, { schema: StatsResponseSchema });
  return stats;
}

/** Stats in this device's time zone. Pass `enabled: false` for guests (no request). */
export function useStats(enabled: boolean) {
  const timeZone = deviceTimeZone();
  return useQuery({
    // The zone is part of the key: travelling to another zone means other numbers.
    queryKey: [...STATS_KEY, timeZone],
    queryFn: () => fetchStats(timeZone),
    enabled,
  });
}
