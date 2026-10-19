import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { loadFromStorage, saveToStorage } from "../../lib/storage";

/** Device-only preferences (not timer settings, so they're kept separate). */
export const PreferencesSchema = z.object({
  /** Play a chime when a session or break ends. */
  soundEnabled: z.boolean(),
  /** The user said "Not now" to notifications (or already answered); don't ask again. */
  notificationPromptDismissed: z.boolean(),
  /**
   * Accounts (by id) that said "Not now" to importing this device's guest
   * history. `.default([])` keeps preferences saved before this field
   * existed valid, instead of resetting them all.
   */
  importDeclinedFor: z.array(z.string()).default([]),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  soundEnabled: true,
  notificationPromptDismissed: false,
  importDeclinedFor: [],
};

const STORAGE_KEY = "preferences";

/**
 * Preferences saved in localStorage.
 *
 * @returns `[preferences, update]`, where `update` merges in changed fields.
 */
export function usePreferences(): readonly [Preferences, (changes: Partial<Preferences>) => void] {
  const [preferences, setPreferences] = useState(() =>
    loadFromStorage(STORAGE_KEY, PreferencesSchema, DEFAULT_PREFERENCES),
  );

  // Save whenever preferences change (in an effect, so the updater below stays pure).
  useEffect(() => {
    saveToStorage(STORAGE_KEY, preferences);
  }, [preferences]);

  const update = useCallback((changes: Partial<Preferences>) => {
    setPreferences((previous) => ({ ...previous, ...changes }));
  }, []);

  return [preferences, update] as const;
}
