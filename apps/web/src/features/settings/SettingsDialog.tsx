import {
  DEFAULT_TIMER_SETTINGS,
  TIMER_SETTING_LIMITS,
  TimerSettingsSchema,
  type TimerSettings,
} from "@summit/shared";
import { useId, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../components/Modal";

type SettingName = keyof TimerSettings;

/** The form's fields, in display order. Limits come from @summit/shared. */
const FIELDS: readonly { name: SettingName; label: string; unit: string }[] = [
  { name: "focusMinutes", label: "Focus", unit: "minutes" },
  { name: "shortBreakMinutes", label: "Short break", unit: "minutes" },
  { name: "longBreakMinutes", label: "Long break", unit: "minutes" },
  { name: "longBreakEvery", label: "Long break after every", unit: "focus sessions" },
];

export interface SettingsDialogProps {
  open: boolean;
  /** The settings currently in use; the form starts from these. */
  settings: TimerSettings;
  /** Called with valid settings when the user saves. */
  onSave: (settings: TimerSettings) => void;
  /** Called when the user closes without saving (Cancel or Esc). */
  onClose: () => void;
}

/** A modal form for editing the timer settings. */
export function SettingsDialog({ open, settings, onSave, onClose }: SettingsDialogProps) {
  const titleId = useId();

  return (
    <Modal open={open} onDismiss={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-lg font-semibold">
        Timer settings
      </h2>
      {/* Mount the form only while open, so each opening starts fresh from
          the saved settings and unsaved edits from last time are discarded. */}
      {open && <SettingsForm initial={settings} onSave={onSave} onCancel={onClose} />}
    </Modal>
  );
}

/** Field values while editing. Kept as text so the user can clear a box while typing. */
type FormValues = Record<SettingName, string>;
type FormErrors = Partial<Record<SettingName, string>>;

const toFormValues = (settings: TimerSettings): FormValues => ({
  focusMinutes: String(settings.focusMinutes),
  shortBreakMinutes: String(settings.shortBreakMinutes),
  longBreakMinutes: String(settings.longBreakMinutes),
  longBreakEvery: String(settings.longBreakEvery),
});

/** Turns a text box's value into a number; an empty box becomes NaN (invalid). */
const toNumber = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));

function SettingsForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: TimerSettings;
  onSave: (settings: TimerSettings) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(initial));
  const [errors, setErrors] = useState<FormErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Stop the browser's default form submission (a page reload).
    event.preventDefault();

    // Validate with the same schema the rest of the app (and later the API) uses.
    const result = TimerSettingsSchema.safeParse({
      focusMinutes: toNumber(values.focusMinutes),
      shortBreakMinutes: toNumber(values.shortBreakMinutes),
      longBreakMinutes: toNumber(values.longBreakMinutes),
      longBreakEvery: toNumber(values.longBreakEvery),
    });

    if (result.success) {
      onSave(result.data);
      return;
    }

    // Show one friendly message per invalid field. (Zod's own messages are
    // written for developers, e.g. "Too small: expected number to be >=1".)
    const nextErrors: FormErrors = {};
    for (const issue of result.error.issues) {
      const name = issue.path[0] as SettingName;
      const { min, max } = TIMER_SETTING_LIMITS[name];
      nextErrors[name] = `Enter a whole number from ${min} to ${max}.`;
    }
    setErrors(nextErrors);

    // Move keyboard focus to the first problem so the user can fix it right away.
    const firstInvalid = FIELDS.find((field) => nextErrors[field.name]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${firstInvalid.name}"]`)?.focus();
    }
  };

  return (
    // noValidate: we show our own consistent messages instead of the
    // browser's built-in popups, which look different in every browser.
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-4">
      {FIELDS.map(({ name, label, unit }) => {
        const inputId = `${idPrefix}-${name}`;
        const errorId = `${inputId}-error`;
        const error = errors[name];
        return (
          <div key={name} className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-sm font-medium">
              {label} <span className="text-slate-500 dark:text-slate-400">({unit})</span>
            </label>
            <input
              id={inputId}
              name={name}
              type="number"
              // Shows a number keypad on phones.
              inputMode="numeric"
              min={TIMER_SETTING_LIMITS[name].min}
              max={TIMER_SETTING_LIMITS[name].max}
              step={1}
              value={values[name]}
              onChange={(event) => setValues((prev) => ({ ...prev, [name]: event.target.value }))}
              // Tell assistive tech the field is invalid and where the message is.
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={`rounded-lg bg-white px-3 py-2 ring-1 dark:bg-slate-950 ${
                error ? "ring-2 ring-red-500" : "ring-slate-300 dark:ring-slate-700"
              }`}
            />
            {error && (
              <p id={errorId} className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        );
      })}

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Changes apply from the next session or break.
      </p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => {
            setValues(toFormValues(DEFAULT_TIMER_SETTINGS));
            setErrors({});
          }}
          className="text-sm font-medium text-teal-700 underline-offset-4 hover:underline sm:mr-auto dark:text-teal-400"
        >
          Reset to defaults
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-800"
        >
          Save
        </button>
      </div>
    </form>
  );
}
