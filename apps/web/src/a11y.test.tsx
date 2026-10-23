// Automated accessibility checks (axe-core) on every page and dialog, in the
// states people actually see them: as a guest, signed in, with data, and
// with dialogs open. Colors are checked separately, in a real browser.
import type { Stats } from "@summit/shared";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import App from "./App";
import { axeViolations } from "./test/axe";
import { makeMember, makeRoomState } from "./test/fakeRoomConnection";
import { makeSession } from "./test/fixtures";
import { renderRoomApp, signInAsAna } from "./test/renderRoomApp";
import { server } from "./test/server";

const STATS: Stats = {
  timeZone: "UTC",
  today: "2026-10-21",
  totals: { focusMinutes: 125, completedSessions: 5, abandonedSessions: 1 },
  streak: { current: 3, longest: 7 },
  days: [{ date: "2026-10-21", focusMinutes: 125, sessions: 5 }],
  byHour: Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 125 : 0)),
  byTag: [{ tag: "LeetCode", focusMinutes: 125, sessions: 5 }],
};

/** Signed in as Ana, with some history, a climb, and stats. */
function signedInWithData() {
  signInAsAna();
  const sessions = [
    makeSession("2026-10-21T09:25:00.000Z", { tag: "LeetCode" }),
    makeSession("2026-10-20T09:25:00.000Z", { status: "ABANDONED" }),
  ];
  server.use(
    http.get("*/api/sessions", () => HttpResponse.json({ sessions, nextCursor: null })),
    http.get("*/api/climb", () =>
      HttpResponse.json({
        progress: { climbs: [{ peakId: "mt-fuji", metersGained: 250, summitedAt: null }] },
      }),
    ),
    http.get("*/api/tags/recent", () => HttpResponse.json({ tags: ["LeetCode"] })),
    http.get("*/api/stats", () => HttpResponse.json({ stats: STATS })),
  );
}

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  render(<App />);
  return userEvent.setup();
}

describe("accessibility (axe-core)", () => {
  it("the guest timer page", async () => {
    renderAt("/");
    await screen.findByRole("button", { name: "Start focus" });

    expect(await axeViolations()).toEqual([]);
  });

  it.each([
    ["/login", "Sign in"],
    ["/register", "Create your account"],
  ])("%s", async (path, heading) => {
    renderAt(path);
    await screen.findByRole("heading", { name: heading });

    expect(await axeViolations()).toEqual([]);
  });

  it("the signed-in timer page, with history, climb, and tags", async () => {
    signedInWithData();
    renderAt("/");
    await screen.findByRole("img", { name: /Climber at 250 m/ });
    await screen.findByRole("group", { name: "Recent tags" });

    expect(await axeViolations()).toEqual([]);
  });

  it("the account page", async () => {
    signedInWithData();
    renderAt("/account");
    await screen.findByRole("heading", { name: "Your account" });

    expect(await axeViolations()).toEqual([]);
  });

  it("the stats page, as a guest", async () => {
    renderAt("/stats");
    await screen.findByRole("link", { name: "Sign in to see your stats" });
    expect(await axeViolations()).toEqual([]);
  });

  it("the stats page with data, tables open", async () => {
    signedInWithData();
    const user = renderAt("/stats");
    await screen.findByText("Current streak");
    for (const summary of screen.getAllByText("Show as a table")) await user.click(summary);

    expect(await axeViolations()).toEqual([]);
  });

  it("the rope teams page", async () => {
    signedInWithData();
    renderAt("/rooms");
    await screen.findByRole("button", { name: "Start a rope team" });

    expect(await axeViolations()).toEqual([]);
  });

  it("a rope team room during a session", async () => {
    signedInWithData();
    const app = renderRoomApp("/rooms/K7QM2X", (connection) => {
      connection.replies.join = () =>
        Promise.resolve({
          ok: true,
          data: makeRoomState({
            members: [makeMember({ status: "focusing" })],
            phase: {
              kind: "focus",
              sessionId: "00000000-0000-4000-8000-000000000001",
              plannedMinutes: 25,
              startsAt: new Date(Date.now() - 60_000).toISOString(),
              endsAt: new Date(Date.now() + 24 * 60_000).toISOString(),
            },
          }),
        });
    });
    await waitFor(() => expect(app.connections).toHaveLength(1));
    act(() => app.connection().emit({ type: "connected" }));
    await screen.findByRole("heading", { name: "Rope team" });

    expect(await axeViolations()).toEqual([]);
  });

  it("the timer settings dialog", async () => {
    const user = renderAt("/");
    await user.click(await screen.findByRole("button", { name: "Timer settings" }));
    await screen.findByRole("dialog");

    expect(await axeViolations()).toEqual([]);
  });

  it("the give-up confirmation", async () => {
    const user = renderAt("/");
    await user.click(await screen.findByRole("button", { name: "Start focus" }));
    await user.click(screen.getByRole("button", { name: "Give up" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Keep climbing" })).toBeInTheDocument();

    expect(await axeViolations()).toEqual([]);
  });
});
