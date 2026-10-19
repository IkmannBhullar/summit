import { useId, type InputHTMLAttributes } from "react";

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "onChange" | "value"
> {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown under the input, linked to it for screen readers. */
  error?: string;
  /** Help text shown under the input when there's no error. */
  hint?: string;
}

/** A labelled text input with an accessible error or hint underneath. */
export function TextField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`rounded-lg bg-white px-3 py-2.5 ring-1 dark:bg-slate-950 ${
          error ? "ring-2 ring-red-500" : "ring-slate-300 dark:ring-slate-700"
        }`}
      />
      {message && (
        <p
          id={messageId}
          className={`text-sm ${error ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
