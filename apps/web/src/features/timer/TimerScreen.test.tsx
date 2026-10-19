// Component tests for the timer screen: what a user sees and clicks.
// Queries use roles and visible text, like a person (or screen reader) would.
import { DEFAULT_TIMER_SETTINGS } from "@summit/shared";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimerEvent } from "./timerMachine";
import { TimerScreen } from "./TimerScreen";

const MIN = 60_000;

beforeEach(() => {
  // Fake only what the timer uses: its tick interval and the clock.
  // setTimeout stays real because Testing Library and user-event rely on it
  // internally (to let React settle after each click). If it were faked,
  // nothing would ever advance it and every click would hang.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(Date.parse("2026-10-17T09:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Renders the screen and returns a user-event "user" for realistic clicks. */
function setup(props: Parameters<typeof TimerScreen>[0] = {}) {
  const user = userEvent.setup();
  render(<TimerScreen {...props} />);
  return { user };
}

/** Moves the fake clock forward inside act(), firing due timers. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const button = (name: string) => screen.getByRole("button", { name });
const clock = () => screen.getByRole("timer");

describe("TimerScreen", () => {
  it("starts idle on focus, showing the full 25:00", () => {
    setup();

    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    expect(clock()).toHaveTextContent("25:00");
    expect(button("Start focus")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Give up" })).not.toBeInTheDocument();
  });

  it("counts down after starting and offers Pause and Give up", async () => {
    const { user } = setup();

    await user.click(button("Start focus"));
    advance(MIN);

    expect(clock()).toHaveTextContent("24:00");
    expect(button("Pause")).toBeInTheDocument();
    expect(button("Give up")).toBeInTheDocument();
  });

  it("pauses and resumes", async () => {
    const { user } = setup();
    await user.click(button("Start focus"));
    advance(5 * MIN);

    await user.click(button("Pause"));
    advance(10 * MIN);

    expect(clock()).toHaveTextContent("20:00");
    expect(screen.getByRole("heading", { name: "Focus · Paused" })).toBeInTheDocument();

    await user.click(button("Resume"));
    advance(MIN);
    expect(clock()).toHaveTextContent("19:00");
  });

  describe("giving up", () => {
    it("asks for confirmation first, and 'Keep climbing' changes nothing", async () => {
      const { user } = setup();
      await user.click(button("Start focus"));

      await user.click(button("Give up"));
      const dialog = screen.getByRole("dialog", { name: "Give up this session?" });
      expect(dialog).toHaveTextContent("this session's elevation won't count");

      await user.click(button("Keep climbing"));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(button("Pause")).toBeInTheDocument(); // still running
    });

    it("abandons the session after confirming", async () => {
      const onEvent = vi.fn<(event: TimerEvent) => void>();
      const { user } = setup({ onEvent });
      await user.click(button("Start focus"));
      advance(10 * MIN);

      await user.click(button("Give up"));
      // Two buttons say "Give up" now; pick the one inside the dialog.
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Give up" }));

      expect(clock()).toHaveTextContent("25:00");
      expect(button("Start focus")).toBeInTheDocument();
      expect(screen.getByText(/you slid back down/i)).toBeInTheDocument();
      expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
        "focusStarted",
        "focusAbandoned",
      ]);
    });
  });

  it("celebrates a completed session and moves to a short break", async () => {
    const { user } = setup();
    await user.click(button("Start focus"));

    advance(25 * MIN);

    expect(screen.getByText("Session complete: +250 m")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Short break" })).toBeInTheDocument();
    expect(clock()).toHaveTextContent("5:00");
    expect(button("Start break")).toBeInTheDocument();
  });

  it("can skip a break back to focus", async () => {
    const { user } = setup();
    await user.click(button("Start focus"));
    advance(25 * MIN);

    await user.click(button("Skip break"));

    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    expect(clock()).toHaveTextContent("25:00");
  });

  it("shows today's completed count it's given", () => {
    setup({ completedToday: 3 });

    expect(screen.getByText("3 sessions today")).toBeInTheDocument();
  });

  it("uses the settings it's given", () => {
    setup({ settings: { ...DEFAULT_TIMER_SETTINGS, focusMinutes: 50 } });

    expect(clock()).toHaveTextContent("50:00");
  });

  it("shows the countdown in the browser tab title while running", async () => {
    const { user } = setup();
    expect(document.title).toBe("Summit");

    await user.click(button("Start focus"));
    advance(30_000);

    expect(document.title).toBe("24:30 · Focus · Summit");
  });
});
