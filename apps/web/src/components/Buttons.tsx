import type { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  /** Optional for submit buttons, which the form handles. */
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}

/** The main call-to-action button. */
export function PrimaryButton({ children, onClick, type = "button", disabled }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-teal-700 px-8 py-3 text-lg font-semibold text-white hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500"
    >
      {children}
    </button>
  );
}

/** A quieter, outlined button for secondary actions. */
export function SecondaryButton({ children, onClick, type = "button", disabled }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-8 py-3 text-lg font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
