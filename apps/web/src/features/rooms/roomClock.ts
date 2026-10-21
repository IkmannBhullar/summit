/**
 * What a room's timer shows right now, worked out from the server's
 * timestamps. Pure: no timers, no Date.now(), so it's easy to test.
 *
 * Nothing counts down tick by tick. The page re-renders often and calls
 * this with the current server time; the answer is always endsAt − now.
 */
import type { RoomPhase } from "@summit/shared";

export type RoomClock =
  | { kind: "idle" }
  /** Focus is about to begin ("Starting in 3…"). */
  | { kind: "countdown"; msLeft: number }
  | { kind: "focus"; msLeft: number; /** 0 → 1, for the progress bar. */ fractionDone: number }
  | { kind: "break"; msLeft: number };

/**
 * @param serverNow - The server's current time in ms (Date.now() + clock offset).
 */
export function roomClock(phase: RoomPhase, serverNow: number): RoomClock {
  switch (phase.kind) {
    case "idle":
      return { kind: "idle" };
    case "focus": {
      const startsAt = Date.parse(phase.startsAt);
      const endsAt = Date.parse(phase.endsAt);
      if (serverNow < startsAt) return { kind: "countdown", msLeft: startsAt - serverNow };
      return {
        kind: "focus",
        // The server ends the session; until its snapshot arrives, show 0:00.
        msLeft: Math.max(0, endsAt - serverNow),
        fractionDone: Math.min(1, (serverNow - startsAt) / (endsAt - startsAt)),
      };
    }
    case "break":
      return { kind: "break", msLeft: Math.max(0, Date.parse(phase.endsAt) - serverNow) };
  }
}
