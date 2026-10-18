import { DEFAULT_TIMER_SETTINGS, TimerSettingsSchema, type TimerSettings } from "@summit/shared";
import { useCallback, useState } from "react";
import { loadFromStorage, saveToStorage } from "../../lib/storage";

const STORAGE_KEY = "settings";

/**
 * The user's timer settings, loaded from and saved to localStorage.
 *
 * @returns `[settings, saveSettings]`, like useState. Saving updates the
 *   screen immediately and persists for the next visit.
 */
export function useSettings(): readonly [TimerSettings, (next: TimerSettings) => void] {
  // The function form of useState runs only on the first render, so we read
  // storage once instead of on every render.
  const [settings, setSettings] = useState(() =>
    loadFromStorage(STORAGE_KEY, TimerSettingsSchema, DEFAULT_TIMER_SETTINGS),
  );

  const saveSettings = useCallback((next: TimerSettings) => {
    setSettings(next);
    saveToStorage(STORAGE_KEY, next);
  }, []);

  return [settings, saveSettings] as const;
}
