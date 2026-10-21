import type { RoomState } from "@summit/shared";
import { useEffect, useRef } from "react";
import { chime } from "../alerts/chime";
import { showNotification } from "../alerts/notifications";
import { teamAlertFor } from "./teamAlerts";

/**
 * Chimes and notifies when a team session ends while you're in the room.
 *
 * Only for NEW outcomes: whatever result is showing when you first join (or
 * rejoin) happened before you got here, so it stays quiet.
 */
export function useTeamAlerts(room: RoomState | null, soundEnabled: boolean): void {
  // The `at` of the outcome seen last. undefined: no snapshot seen yet.
  const lastSeenAt = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!room) return;
    const outcome = room.lastOutcome;
    const previous = lastSeenAt.current;
    lastSeenAt.current = outcome?.at ?? null;
    if (previous === undefined || !outcome || outcome.at === previous) return;

    const alert = teamAlertFor(outcome);
    if (alert.chime && soundEnabled) chime.play(alert.chime);
    // Only appears if permission was granted and the tab is hidden.
    void showNotification(alert.title, alert.body);
  }, [room, soundEnabled]);
}
