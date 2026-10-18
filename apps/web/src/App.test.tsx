// Integration tests for the app shell: features working together.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { makeSession } from "./test/fixtures";

/** Finds the mountain drawing by its exact accessible name (what a screen reader announces). */
const mountain = (name: string) => screen.getByRole("img", { name });

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
    expect(mountain("Climber at 0 m of 3,776 m on Mt. Fuji")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(25 * MIN);

    expect(screen.getByText("1 session today")).toBeInTheDocument();
    expect(mountain("Climber at 250 m of 3,776 m on Mt. Fuji")).toBeInTheDocument();
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
    expect(mountain("Climber at 0 m of 3,776 m on Mt. Fuji")).toBeInTheDocument();
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
    expect(mountain("Climber at 250 m of 3,776 m on Mt. Fuji")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Short break" })).toBeInTheDocument();
  });
});

describe("App: reaching a summit", () => {
  const MIN = 60_000;
  const T0 = Date.parse("2026-10-17T09:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(T0);
    // 15 earlier sessions = 3,750 m: just 26 m below Mt. Fuji's 3,776 m summit.
    const earlier = Array.from({ length: 15 }, (_, i) =>
      makeSession(new Date(T0 - (i + 1) * 24 * 60 * MIN).toISOString()),
    );
    localStorage.setItem("summit:sessions", JSON.stringify(earlier));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Starts a focus session and lets it run to the end. */
  async function completeASession(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    act(() => {
      vi.advanceTimersByTime(25 * MIN);
    });
  }

  it("celebrates the summit and moves on to the next peak", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(mountain("Climber at 3,750 m of 3,776 m on Mt. Fuji")).toBeInTheDocument();

    await completeASession(user);

    const dialog = screen.getByRole("dialog", { name: "You summited Mt. Fuji!" });
    expect(dialog).toHaveTextContent("Next up: Mt. Rainier (4,392 m)");

    await user.click(within(dialog).getByRole("button", { name: "Keep climbing" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mountain("Climber at 224 m of 4,392 m on Mt. Rainier")).toBeInTheDocument();
  });

  it("doesn't celebrate the same summit again after a reload", async () => {
    const user = userEvent.setup();
    const firstVisit = render(<App />);
    await completeASession(user);
    await user.click(screen.getByRole("button", { name: "Keep climbing" }));
    firstVisit.unmount();

    render(<App />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mountain("Climber at 224 m of 4,392 m on Mt. Rainier")).toBeInTheDocument();
  });
});
