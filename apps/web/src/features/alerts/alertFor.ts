import type { TimerEvent } from "../timer/timerMachine";
import type { ChimeKind } from "./chime";

/** What to play and say when a timer event happens. */
export interface Alert {
  chime: ChimeKind;
  title: string;
  body: string;
}

/**
 * Decides how to announce a timer event, or null for events that shouldn't
 * make noise. Pure (no sound, no browser APIs), so it's trivial to test.
 */
export function alertFor(event: TimerEvent): Alert | null {
  switch (event.type) {
    case "focusCompleted":
      return {
        chime: "focusEnd",
        title: "Session complete!",
        body: `+${event.session.metersGained} m. Time for a break.`,
      };
    case "breakCompleted":
      return { chime: "breakEnd", title: "Break's over", body: "Ready for the next climb?" };
    case "focusAbandoned":
      // The user just chose to give up; no need to tell them about it.
      return null;
  }
}
