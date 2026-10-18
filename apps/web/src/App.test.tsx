// Integration tests for the app shell: features working together.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

/** Opens settings, sets focus length, and saves. */
async function setFocusMinutes(user: ReturnType<typeof userEvent.setup>, minutes: string) {
  await user.click(screen.getByRole("button", { name: "Timer settings" }));
  const focusInput = screen.getByRole("spinbutton", { name: /^focus/i });
  await user.clear(focusInput);
  await user.type(focusInput, minutes);
  await user.click(screen.getByRole("button", { name: "Save" }));
}

describe("App", () => {
  // Query by role, the way a screen reader sees the page, instead of by
  // CSS class. Tests then survive styling changes and double as a basic
  // accessibility check.
  it("shows the Summit heading", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Summit" })).toBeInTheDocument();
  });

  it("shows the focus timer, ready to start", () => {
    render(<App />);

    expect(screen.getByRole("timer")).toHaveTextContent("25:00");
    expect(screen.getByRole("button", { name: "Start focus" })).toBeInTheDocument();
  });

  it("applies saved settings to the timer", async () => {
    const user = userEvent.setup();
    render(<App />);

    await setFocusMinutes(user, "40");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("40:00");
  });

  // Simulates closing the app and opening it again.
  it("remembers settings across visits", async () => {
    const user = userEvent.setup();
    const firstVisit = render(<App />);
    await setFocusMinutes(user, "40");
    firstVisit.unmount();

    render(<App />);

    expect(screen.getByRole("timer")).toHaveTextContent("40:00");
  });
});
