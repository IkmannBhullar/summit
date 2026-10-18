// Tests for rebuilding climb progress from session history.
import { describe, expect, it } from "vitest";
import { getCurrentClimb } from "./climb";
import { progressFromSessions } from "./progress";
import type { FocusSession } from "./session";

let idCounter = 0;

/** Builds a valid session ending at `endedAt`; overrides tweak one field. */
function session(endedAt: string, overrides: Partial<FocusSession> = {}): FocusSession {
  idCounter += 1;
  const status = overrides.status ?? "COMPLETED";
  return {
    id: `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`,
    plannedMinutes: 25,
    startedAt: new Date(Date.parse(endedAt) - 25 * 60_000).toISOString(),
    endedAt,
    status,
    tag: null,
    metersGained: status === "COMPLETED" ? 250 : 0,
    roomId: null,
    ...overrides,
  };
}

describe("progressFromSessions", () => {
  it("starts at 0 m on the first peak with no history", () => {
    expect(getCurrentClimb(progressFromSessions([]))?.climb.metersGained).toBe(0);
  });

  it("adds up completed sessions", () => {
    const progress = progressFromSessions([
      session("2026-10-17T09:25:00.000Z"),
      session("2026-10-17T10:00:00.000Z"),
    ]);

    expect(getCurrentClimb(progress)?.climb.metersGained).toBe(500);
  });

  it("ignores abandoned sessions", () => {
    const progress = progressFromSessions([
      session("2026-10-17T09:25:00.000Z"),
      session("2026-10-17T10:00:00.000Z", { status: "ABANDONED" }),
    ]);

    expect(getCurrentClimb(progress)?.climb.metersGained).toBe(250);
  });

  // History may be stored newest-first; the result must not depend on order.
  it("gives the same result whatever order sessions are listed in", () => {
    const sessions = Array.from({ length: 20 }, (_, i) =>
      session(new Date(Date.parse("2026-10-01T09:00:00.000Z") + i * 3_600_000).toISOString()),
    );

    expect(progressFromSessions(sessions.toReversed())).toEqual(progressFromSessions(sessions));
  });

  it("stamps a summit with the endedAt of the session that reached it", () => {
    // 16 × 250 m reaches Mt. Fuji's 3,776 m on the 16th session.
    const sessions = Array.from({ length: 16 }, (_, i) =>
      session(`2026-10-${String(i + 1).padStart(2, "0")}T09:25:00.000Z`),
    );

    const progress = progressFromSessions(sessions);

    expect(progress.climbs[0]).toEqual({
      peakId: "mt-fuji",
      metersGained: 3776,
      summitedAt: "2026-10-16T09:25:00.000Z",
    });
    expect(getCurrentClimb(progress)?.peak.id).toBe("mt-rainier");
  });
});
