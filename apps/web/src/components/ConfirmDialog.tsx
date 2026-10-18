import { useEffect, useId, useRef, type ReactNode } from "react";

export interface ConfirmDialogProps {
  /** Whether the dialog is showing. The parent owns this state. */
  open: boolean;
  title: string;
  /** Explanation shown under the title. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Called when the user confirms. The parent should then set open=false. */
  onConfirm: () => void;
  /** Called when the user cancels: the cancel button, the Esc key, or the browser closing it. */
  onCancel: () => void;
}

/**
 * A modal "are you sure?" dialog built on the browser's native <dialog>.
 *
 * Calling showModal() gives us, for free: a backdrop, focus moved into the
 * dialog and kept there, the rest of the page made inert (not clickable or
 * reachable with Tab), and Esc to close. A hand-made <div> modal would need
 * a library or a lot of careful code for all of that.
 *
 * The Cancel button comes first in the markup, so it gets focus when the
 * dialog opens: pressing Enter by reflex picks the *safe* option.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Unique ids link the dialog to its title and text for screen readers.
  const titleId = useId();
  const descriptionId = useId();

  // Sync the `open` prop to the real dialog. showModal() must be called as a
  // method (setting the `open` attribute alone wouldn't make it modal).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // The browser closed it (e.g. Esc) while we still think it's open:
      // report that as a cancel so the parent's state stays in sync.
      onClose={() => {
        if (open) onCancel();
      }}
      // Tailwind's reset removes the browser's default centering margin, so add it back.
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-slate-100"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      <div id={descriptionId} className="mt-2 text-slate-600 dark:text-slate-400">
        {children}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {/* flex-col-reverse puts Cancel at the bottom on phones, but it's still
            first in the markup, so it still gets the initial focus. */}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
