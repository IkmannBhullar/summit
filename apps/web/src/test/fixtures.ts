// Test data builders shared by several test files.
import { metersEarned, type FocusSession } from "@summit/shared";

let counter = 0;

/**
 * Builds a valid finished 25-minute session that ended at `endedAt`.
 * Pass overrides to change one thing, e.g. `{ status: "ABANDONED" }`.
 */
export function makeSession(endedAt: string, overrides: Partial<FocusSession> = {}): FocusSession {
  counter += 1;
  const status = overrides.status ?? "COMPLETED";
  const plannedMinutes = overrides.plannedMinutes ?? 25;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    plannedMinutes,
    startedAt: new Date(Date.parse(endedAt) - plannedMinutes * 60_000).toISOString(),
    endedAt,
    status,
    tag: null,
    metersGained: metersEarned(status, plannedMinutes),
    roomId: null,
    ...overrides,
  };
}
