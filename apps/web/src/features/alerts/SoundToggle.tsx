export interface SoundToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

/**
 * An on/off button for the chime. `aria-pressed` makes it a "toggle button",
 * so screen readers announce "Sound, toggle button, pressed" (or not pressed).
 */
export function SoundToggle({ enabled, onChange }: SoundToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label="Sound"
      onClick={() => onChange(!enabled)}
      // p-2.5 around the 24px icon = a 44px tap target.
      className="rounded-lg p-2.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Speaker */}
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {enabled ? (
          // Sound waves
          <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
        ) : (
          // An X: muted
          <path d="M16 9l5 6M21 9l-5 6" />
        )}
      </svg>
    </button>
  );
}
