// Tests for the reusable confirmation dialog.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

/** Renders the dialog with spies for both callbacks. */
function setup(props: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmDialog
      open
      title="Delete everything?"
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    >
      This can&apos;t be undone.
    </ConfirmDialog>,
  );
  return { ...view, onConfirm, onCancel, user: userEvent.setup() };
}

describe("ConfirmDialog", () => {
  it("is labelled by its title and described by its text", () => {
    setup();

    const dialog = screen.getByRole("dialog", { name: "Delete everything?" });
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
  });

  it("isn't shown when closed", () => {
    setup({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("calls onConfirm / onCancel from its buttons", async () => {
    const { user, onConfirm, onCancel } = setup({ cancelLabel: "Keep it" });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // The safe choice comes first, so it receives focus when the dialog opens.
  it("puts the cancel button before the confirm button", () => {
    setup();

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Cancel", "Delete"]);
  });

  // Esc makes the browser close the dialog itself; the parent must hear about it.
  it("reports a browser-initiated close (like Esc) as a cancel", () => {
    const { onCancel } = setup();

    screen.getByRole("dialog").closest("dialog")?.close();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("doesn't report a cancel when the parent closes it", () => {
    const { rerender, onCancel, onConfirm } = setup();

    rerender(
      <ConfirmDialog
        open={false}
        title="Delete everything?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        This can&apos;t be undone.
      </ConfirmDialog>,
    );

    expect(onCancel).not.toHaveBeenCalled();
  });
});
