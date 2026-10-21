import type { RoomOutcome } from "@summit/shared";
import type { ChimeKind } from "../alerts/chime";

/** What to play and say when a team session ends. */
export interface TeamAlert {
  /** null: notify only (there's no "sad" chime: a slip shouldn't sound like a win). */
  chime: ChimeKind | null;
  title: string;
  body: string;
}

const SLIP_REASONS = {
  left: "left",
  gave_up: "gave up",
  disconnected: "lost their connection",
} as const;

/** The words for how a team session ended, shared by the banner and the notification. */
export function describeOutcome(outcome: RoomOutcome): string {
  return outcome.kind === "completed"
    ? `Summit push complete: +${outcome.metersEach} m each.`
    : `${outcome.displayName} ${SLIP_REASONS[outcome.reason]}, so the rope team slipped. No meters this time.`;
}

/** Decides how to announce a team outcome. Pure, like alertFor. */
export function teamAlertFor(outcome: RoomOutcome): TeamAlert {
  return outcome.kind === "completed"
    ? { chime: "focusEnd", title: "Team session complete!", body: describeOutcome(outcome) }
    : { chime: null, title: "The rope team slipped", body: describeOutcome(outcome) };
}
