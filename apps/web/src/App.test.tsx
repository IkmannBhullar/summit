// Integration tests for the app shell: features working together.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("App: sessions, history, and reloads", () => {
  const MIN = 60_000;
  const T0 = Date.parse("2026-10-17T09:00:00.000Z");

  beforeEach(() => {
    // Fake only the clock and intervals (see TimerScreen.test.tsx for why).
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Moves the fake clock forward inside act(), firing due timers. */
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it("records a completed session in history, today's count, and climb progress", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/0 m of 3,776 m/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(25 * MIN);

    expect(screen.getByText("1 session today")).toBeInTheDocument();
    expect(screen.getByText(/250 m of 3,776 m/)).toBeInTheDocument();
    const history = screen.getByRole("region", { name: "History" });
    expect(within(history).getByText("+250 m")).toBeInTheDocument();
  });

  it("records a give-up in history without adding elevation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(10 * MIN);
    await user.click(screen.getByRole("button", { name: "Give up" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Give up" }));

    const history = screen.getByRole("region", { name: "History" });
    expect(within(history).getByText("Gave up")).toBeInTheDocument();
    expect(screen.getByText(/0 m of 3,776 m/)).toBeInTheDocument();
    expect(screen.getByText("0 sessions today")).toBeInTheDocument();
  });

  it("continues a running session after a reload", async () => {
    const user = userEvent.setup();
    const beforeReload = render(<App />);
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(10 * MIN);

    beforeReload.unmount(); // the tab reloads...
    vi.setSystemTime(T0 + 12 * MIN); // ...a couple of minutes later
    render(<App />);

    expect(screen.getByRole("timer")).toHaveTextContent("13:00");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  // Decision: a session that ran its full time while the app was closed counts.
  it("counts a session that ended while the app was closed", async () => {
    const user = userEvent.setup();
    const beforeClose = render(<App />);
    await user.click(screen.getByRole("button", { name: "Start focus" }));

    beforeClose.unmount(); // the laptop lid closes...
    vi.setSystemTime(T0 + 2 * 60 * MIN); // ...and opens two hours later
    render(<App />);

    expect(screen.getByText("Session complete: +250 m")).toBeInTheDocument();
    expect(screen.getByText(/250 m of 3,776 m/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Short break" })).toBeInTheDocument();
  });
});
