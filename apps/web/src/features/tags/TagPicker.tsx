import { normalizeTag, sameTag, TAG_MAX_LENGTH } from "@summit/shared";
import { TextField } from "../../components/TextField";

export interface TagPickerProps {
  /** What's in the field (raw text; tidied when the session starts). */
  value: string;
  onChange: (value: string) => void;
  /** Recently used tags, newest first, offered as one-tap buttons. */
  recent: readonly string[];
}

/** Choose a tag for the next focus session: type one, or tap a recent one. */
export function TagPicker({ value, onChange, recent }: TagPickerProps) {
  const current = normalizeTag(value);

  return (
    <div className="flex w-full flex-col gap-2">
      <TextField
        label="Tag (optional)"
        name="tag"
        value={value}
        onChange={onChange}
        maxLength={TAG_MAX_LENGTH}
        placeholder="e.g. LeetCode"
        autoComplete="off"
      />
      {recent.length > 0 && (
        // A labelled group, so screen readers say "Recent tags" before the buttons.
        <div role="group" aria-label="Recent tags" className="flex flex-wrap gap-2">
          {recent.map((tag) => {
            const selected = current !== "" && sameTag(tag, current);
            return (
              <button
                key={tag}
                type="button"
                // aria-pressed makes it a toggle: announced as "pressed" or not.
                aria-pressed={selected}
                onClick={() => onChange(selected ? "" : tag)}
                className={`min-h-11 rounded-full px-4 text-sm font-medium ring-1 ${
                  selected
                    ? "bg-teal-700 text-white ring-teal-700 dark:bg-teal-600 dark:ring-teal-600"
                    : "text-slate-700 ring-slate-300 hover:bg-slate-100 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
