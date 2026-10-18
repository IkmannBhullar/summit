import { useId, type ReactNode } from "react";
import { Modal } from "./Modal";

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
 * An "are you sure?" dialog for destructive actions.
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
  // Unique ids link the dialog to its title and text for screen readers.
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Modal open={open} onDismiss={onCancel} labelledBy={titleId} describedBy={descriptionId}>
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
    </Modal>
  );
}
