import { useEffect } from "react";
import type { Chime } from "./chime";

/**
 * Unlocks audio on the user's clicks, taps, and key presses.
 *
 * The browser only lets a page start sound after an interaction. Listening
 * on the whole document means *any* interaction (usually clicking Start)
 * unlocks the chime that plays when the session ends 25 minutes later.
 * Unlocking repeatedly is harmless, and it re-wakes audio if the OS paused it.
 */
export function useAudioUnlock(chime: Chime): void {
  useEffect(() => {
    const unlock = () => chime.unlock();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [chime]);
}
