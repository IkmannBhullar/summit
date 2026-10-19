/**
 * State the layout shares with every page, passed through React Router's
 * "outlet context" (the layout renders pages in its <Outlet>).
 */
import type { TimerSettings } from "@summit/shared";
import { useOutletContext } from "react-router";
import type { Preferences } from "./features/alerts/usePreferences";

export interface ShellContext {
  settings: TimerSettings;
  preferences: Preferences;
  updatePreferences: (changes: Partial<Preferences>) => void;
}

/** Inside a page: the shared shell state. */
export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}
