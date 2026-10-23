import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { chime } from "./features/alerts/chime";
import { SoundToggle } from "./features/alerts/SoundToggle";
import { useAudioUnlock } from "./features/alerts/useAudioUnlock";
import { usePreferences } from "./features/alerts/usePreferences";
import { AccountLink } from "./features/auth/AccountLink";
import { RoomsLink } from "./features/rooms/RoomsLink";
import { StatsLink } from "./features/stats/StatsLink";
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

  // After moving to another page, put keyboard focus at the start of its
  // content (where the skip link goes), so keyboard and screen-reader users
  // begin at the top of the new page, not wherever the old link was.
  // Comparing paths (not "skip the first run") stays correct when
  // StrictMode runs effects twice on mount.
  const { pathname } = useLocation();
  const content = useRef<HTMLDivElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    content.current?.focus();
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Safe-area padding: when installed on a phone with a notch or
          home bar, keep content out from under them (needs
          viewport-fit=cover in index.html). */}
      {/* The first thing Tab reaches: jump past the header. It waits just
          above the top of the screen and slides into view when focused.
          (Tailwind's sr-only/not-sr-only would reset its padding.) */}
      <a
        href="#content"
        className="absolute top-2 left-2 z-50 -translate-y-20 rounded-lg bg-white px-4 py-2 font-medium text-teal-800 shadow-lg focus:translate-y-0 dark:bg-slate-900 dark:text-teal-300"
      >
        Skip to content
      </a>
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
          <StatsLink />
          <RoomsLink />
          <AccountLink />
        </div>
      </header>

      {/* tabIndex={-1}: focusable by script (above) and the skip link, but
          not a stop when pressing Tab. */}
      <div
        id="content"
        ref={content}
        tabIndex={-1}
        className="flex flex-1 flex-col focus:outline-none"
      >
        <Outlet context={shell} />
      </div>

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
