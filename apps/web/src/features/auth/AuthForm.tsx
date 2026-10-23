import type { FormEvent, ReactNode } from "react";

/** Shared frame for the login and register pages: heading, form, error, footer link. */
export function AuthForm({
  title,
  onSubmit,
  submitLabel,
  isSubmitting,
  formError,
  footer,
  children,
}: {
  title: string;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  /** A problem with the whole form (e.g. wrong password), not one field. */
  formError: string | null;
  footer: ReactNode;
  children: ReactNode;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <section className="w-full max-w-sm">
      <h2 className="text-2xl font-bold">{title}</h2>
      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
        {children}
        {/* role="alert": screen readers announce the error as soon as it appears. */}
        {formError && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-800"
        >
          {isSubmitting ? "Please wait…" : submitLabel}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">{footer}</p>
    </section>
  );
}
