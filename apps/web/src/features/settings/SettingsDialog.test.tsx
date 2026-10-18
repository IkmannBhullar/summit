// Tests for the settings form: editing, validation, reset, and cancel.
import { DEFAULT_TIMER_SETTINGS, type TimerSettings } from "@summit/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

const custom: TimerSettings = {
  focusMinutes: 50,
  shortBreakMinutes: 10,
  longBreakMinutes: 20,
  longBreakEvery: 3,
};

function setup(settings: TimerSettings = custom) {
  const onSave = vi.fn<(settings: TimerSettings) => void>();
  const onClose = vi.fn();
  render(<SettingsDialog open settings={settings} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose, user: userEvent.setup() };
}

// Inputs are found by their visible label text, exactly as a user reads them.
const field = (label: RegExp) => screen.getByRole("spinbutton", { name: label });
const focusField = () => field(/^focus/i);
const save = () => screen.getByRole("button", { name: "Save" });

describe("SettingsDialog", () => {
  it("opens with the current settings filled in", () => {
    setup();

    expect(screen.getByRole("dialog", { name: "Timer settings" })).toBeInTheDocument();
    expect(focusField()).toHaveValue(50);
    expect(field(/short break/i)).toHaveValue(10);
    expect(field(/^long break \(/i)).toHaveValue(20);
    expect(field(/long break after every/i)).toHaveValue(3);
  });

  it("saves edited values as numbers", async () => {
    const { user, onSave } = setup();

    await user.clear(focusField());
    await user.type(focusField(), "45");
    await user.click(save());

    expect(onSave).toHaveBeenCalledWith({ ...custom, focusMinutes: 45 });
  });

  it("shows a friendly error, marks the field invalid, and doesn't save", async () => {
    const { user, onSave } = setup();

    await user.clear(focusField());
    await user.type(focusField(), "0");
    await user.click(save());

    expect(onSave).not.toHaveBeenCalled();
    expect(focusField()).toHaveAttribute("aria-invalid", "true");
    expect(focusField()).toHaveAccessibleDescription("Enter a whole number from 1 to 120.");
    // Focus jumps to the problem so keyboard users can fix it immediately.
    expect(focusField()).toHaveFocus();
  });

  it.each([
    ["empty", ""],
    ["a decimal", "2.5"],
    ["too large", "999"],
  ])("rejects a value that is %s", async (_label, text) => {
    const { user, onSave } = setup();

    await user.clear(focusField());
    if (text) await user.type(focusField(), text);
    await user.click(save());

    expect(onSave).not.toHaveBeenCalled();
  });

  it("resets the form to the defaults (saved only after Save)", async () => {
    const { user, onSave } = setup();

    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(focusField()).toHaveValue(25);
    expect(onSave).not.toHaveBeenCalled();

    await user.click(save());
    expect(onSave).toHaveBeenCalledWith(DEFAULT_TIMER_SETTINGS);
  });

  it("closes without saving on Cancel", async () => {
    const { user, onSave, onClose } = setup();

    await user.clear(focusField());
    await user.type(focusField(), "99");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
