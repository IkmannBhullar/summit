import { useState } from "react";
import { Link, Outlet } from "react-router";
import { chime } from "./features/alerts/chime";
import { SoundToggle } from "./features/alerts/SoundToggle";
import { useAudioUnlock } from "./features/alerts/useAudioUnlock";
import { usePreferences } from "./features/alerts/usePreferences";
import { AccountLink } from "./features/auth/AccountLink";
import { RoomsLink } from "./features/rooms/RoomsLink";
import { UpdatePrompt } from "./features/pwa/UpdatePrompt";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { useSettings } from "./features/settings/useSettings";
import type { ShellContext } from "./shell";

/**
 * The frame around every page: the header (logo, sound, settings, account),
 * the page itself (<Outlet>), and app-wide dialogs. State that several pages
 * need is passed down through the outlet context (see shell.ts).
 */
export function AppLayout() {
  const [settings, saveSettings] = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, updatePreferences] = usePreferences();
  useAudioUnlock(chime);

  const shell: ShellContext = { settings, preferences, updatePreferences };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Safe-area padding: when installed on a phone with a notch or
          home bar, keep content out from under them (needs
          viewport-fit=cover in index.html). */}
      <header className="flex items-center justify-between px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-teal-700 dark:text-teal-400">
          <Link to="/">Summit</Link>
        </h1>
        <div className="flex items-center gap-1">
          <SoundToggle
            enabled={preferences.soundEnabled}
            onChange={(soundEnabled) => updatePreferences({ soundEnabled })}
          />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            // Icon-only button: the label is what screen readers announce.
            aria-label="Timer settings"
            // p-2.5 around a 24px icon = a 44px tap target, the minimum
            // comfortable size for a fingertip.
            className="rounded-lg p-2.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <SlidersIcon />
          </button>
          <RoomsLink />
          <AccountLink />
        </div>
      </header>

      <Outlet context={shell} />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onSave={(next) => {
          saveSettings(next);
          setSettingsOpen(false);
        }}
        onClose={() => setSettingsOpen(false)}
      />

      <UpdatePrompt />
    </div>
  );
}

/** A simple "sliders" icon for the settings button (decorative, so hidden from screen readers). */
function SlidersIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}
