import { useEffect, useRef, type ReactNode } from "react";

export interface ModalProps {
  /** Whether the modal is showing. The parent owns this state. */
  open: boolean;
  /**
   * Called when the browser closes the modal on its own (the Esc key), so
   * the parent can update its state. Not called when the parent closes it.
   */
  onDismiss: () => void;
  /** Id of the element that names the modal (usually its heading). */
  labelledBy: string;
  /** Id of the element that describes it, if any. */
  describedBy?: string;
  children: ReactNode;
}

/**
 * A modal dialog built on the browser's native <dialog>.
 *
 * Calling showModal() gives us, for free: a backdrop, focus moved into the
 * dialog and kept there, the rest of the page made inert (not clickable or
 * reachable with Tab), Esc to close, and focus returned to the button that
 * opened it. A hand-made <div> modal would need a library or a lot of
 * careful code for all of that.
 */
export function Modal({ open, onDismiss, labelledBy, describedBy, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      // The browser closed it (e.g. Esc) while we still think it's open:
      // tell the parent so its state stays in sync.
      onClose={() => {
        if (open) onDismiss();
      }}
      // Tailwind's reset removes the browser's default centering margin, so add it back.
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-slate-100"
    >
      {children}
    </dialog>
  );
}
