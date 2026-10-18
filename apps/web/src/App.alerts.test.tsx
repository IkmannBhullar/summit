// Integration tests for sound and notifications in the full app.
//
// vi.mock swaps the real chime and notification modules for test doubles in
// this file only, so we can check *what the app asked for* without real
// audio or browser permission popups. (vi.mock calls are hoisted: they run
// before the imports below.)
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { chime } from "./features/alerts/chime";
import {
  notificationStatus,
  requestNotificationPermission,
  showNotification,
} from "./features/alerts/notifications";

vi.mock("./features/alerts/chime", () => ({
  chime: { unlock: vi.fn(), play: vi.fn() },
}));
vi.mock("./features/alerts/notifications", () => ({
  notificationStatus: vi.fn(() => "default"),
  requestNotificationPermission: vi.fn(() => Promise.resolve("granted")),
  showNotification: vi.fn(async () => {}),
}));

const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(Date.parse("2026-10-17T09:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Starts a focus session and lets it run to the end. */
async function completeASession(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Start focus" }));
  act(() => {
    vi.advanceTimersByTime(25 * MIN);
  });
}

describe("App: sound", () => {
  it("unlocks audio when the user clicks, so the end-of-session chime can play", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Start focus" }));

    expect(chime.unlock).toHaveBeenCalled();
  });

  it("chimes and sends a notification when a session completes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completeASession(user);

    expect(chime.play).toHaveBeenCalledWith("focusEnd");
    expect(showNotification).toHaveBeenCalledWith("Session complete!", "+250 m. Time for a break.");
  });

  it("stays silent when sound is turned off, and remembers the choice", async () => {
    const user = userEvent.setup();
    const firstVisit = render(<App />);
    const toggle = screen.getByRole("button", { name: "Sound" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    firstVisit.unmount();

    render(<App />);
    expect(screen.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "false");
    await completeASession(user);

    expect(chime.play).not.toHaveBeenCalled();
  });

  it("doesn't chime when the user gives up", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    await user.click(screen.getByRole("button", { name: "Give up" }));
    await user.click(screen.getAllByRole("button", { name: "Give up" }).at(-1)!);

    expect(chime.play).not.toHaveBeenCalled();
  });
});

describe("App: asking for notification permission", () => {
  const prompt = () => screen.queryByRole("region", { name: /heads-up when time's up/i });

  it("doesn't ask before the user has completed a session", () => {
    render(<App />);

    expect(prompt()).not.toBeInTheDocument();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("offers notifications after the first completed session", async () => {
    const user = userEvent.setup();
    render(<App />);

    await completeASession(user);

    expect(prompt()).toBeInTheDocument();
    // Offering isn't asking: the browser popup only appears after a click.
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("asks the browser when the user clicks 'Turn on', then hides the card", async () => {
    const user = userEvent.setup();
    render(<App />);
    await completeASession(user);

    await user.click(screen.getByRole("button", { name: "Turn on notifications" }));

    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(prompt()).not.toBeInTheDocument();
  });

  it("never asks again after 'Not now', even after a reload", async () => {
    const user = userEvent.setup();
    const firstVisit = render(<App />);
    await completeASession(user);

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(prompt()).not.toBeInTheDocument();
    firstVisit.unmount();

    render(<App />);
    expect(prompt()).not.toBeInTheDocument();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it.each(["granted", "denied", "unsupported"] as const)(
    "doesn't offer anything when permission is already %s",
    async (status) => {
      // Once: the app reads the permission one time, when it starts.
      vi.mocked(notificationStatus).mockReturnValueOnce(status);
      const user = userEvent.setup();
      render(<App />);

      await completeASession(user);

      expect(prompt()).not.toBeInTheDocument();
    },
  );
});
