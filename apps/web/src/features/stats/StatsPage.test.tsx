// Tests for /stats through the whole app, with MSW playing the API.
import type { Stats } from "@summit/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { server } from "../../test/server";
import { signInAsAna } from "../../test/renderRoomApp";

/** Every stats request's query string, to check what the page asked for. */
let requested: URLSearchParams[];

const EMPTY: Stats = {
  timeZone: "UTC",
  today: "2026-10-21",
  totals: { focusMinutes: 0, completedSessions: 0, abandonedSessions: 0 },
  streak: { current: 0, longest: 0 },
  days: [],
  byHour: Array.from({ length: 24 }, () => 0),
  byTag: [],
};

const SOME: Stats = {
  ...EMPTY,
  totals: { focusMinutes: 125, completedSessions: 5, abandonedSessions: 2 },
  streak: { current: 3, longest: 7 },
  days: [
    { date: "2026-10-19", focusMinutes: 25, sessions: 1 },
    { date: "2026-10-21", focusMinutes: 100, sessions: 4 },
  ],
  byHour: Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 100 : hour === 20 ? 25 : 0)),
  byTag: [
    { tag: "LeetCode", focusMinutes: 100, sessions: 4 },
    { tag: null, focusMinutes: 25, sessions: 1 },
  ],
};

/** Makes /api/stats answer with `stats` (or an error). */
function serveStats(stats: Stats | "error") {
  server.use(
    http.get("*/api/stats", ({ request }) => {
      requested.push(new URL(request.url).searchParams);
      return stats === "error"
        ? HttpResponse.json(
            { error: { code: "INTERNAL_ERROR", message: "Database is napping." } },
            { status: 500 },
          )
        : HttpResponse.json({ stats });
    }),
  );
}

function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  render(<App />);
  return userEvent.setup();
}

beforeEach(() => {
  requested = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the stats page", () => {
  it("invites guests to sign in, and asks the server for nothing", async () => {
    serveStats(SOME);
    renderAt("/stats");

    const signIn = await screen.findByRole("link", { name: "Sign in to see your stats" });
    expect(signIn).toHaveAttribute("href", "/login");
    expect(requested).toEqual([]);
  });

  // Tests run with TZ=UTC, so pretend this device is in Vancouver: otherwise
  // code that always sent "UTC" would pass too.
  it("asks for stats in this device's time zone", async () => {
    const real = new Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...real,
      timeZone: "America/Vancouver",
    });
    signInAsAna();
    serveStats(SOME);
    renderAt("/stats");

    await screen.findByText("Current streak");
    expect(requested.map((query) => query.get("tz"))).toEqual(["America/Vancouver"]);
  });

  it("shows streaks and totals", async () => {
    signInAsAna();
    serveStats(SOME);
    renderAt("/stats");

    // Each card is a <dt> label ("term") with its <dd> value, inside one box.
    const card = async (label: string) =>
      (await screen.findAllByRole("term")).find((term) => term.textContent === label)!
        .parentElement!;
    expect(await card("Current streak")).toHaveTextContent("3 days");
    expect(await card("Longest streak")).toHaveTextContent("7 days");
    expect(await card("Total focus")).toHaveTextContent("2 h 5 min");
    // Two values in this card: the count, then the given-up detail.
    expect(within(await card("Sessions")).getAllByRole("definition")[0]).toHaveTextContent(/^5$/);
    expect(await card("Sessions")).toHaveTextContent("2 given up");
  });

  it("describes each chart for screen readers, with tables to read instead", async () => {
    signInAsAna();
    serveStats(SOME);
    const user = renderAt("/stats");

    expect(
      await screen.findByRole("img", { name: "Focus on 2 of the last 365 days" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Focus by hour of day. Most focus starts at 9 AM." }),
    ).toBeInTheDocument();

    const heatmap = screen.getByRole("region", { name: /The last year/ });
    await user.click(within(heatmap).getByText("Show as a table"));
    const rows = within(heatmap).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Wed, Oct 21, 20261 h 40 min4",
      "Mon, Oct 19, 202625 min1",
    ]);
  });

  it("lets the year heatmap be scrolled with the keyboard", async () => {
    signInAsAna();
    serveStats(SOME);
    renderAt("/stats");

    const scroller = await screen.findByRole("region", {
      name: "Focus heatmap (scrolls sideways)",
    });
    expect(scroller).toHaveAttribute("tabindex", "0");
  });

  it("lists time per tag, untagged last", async () => {
    signInAsAna();
    serveStats(SOME);
    renderAt("/stats");

    const tags = within(await screen.findByRole("region", { name: "By tag" }));
    expect(tags.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "LeetCode1 h 40 min · 4 sessions",
      "Untagged25 min · 1 session",
    ]);
  });

  it("encourages a first session instead of empty charts", async () => {
    signInAsAna();
    serveStats(EMPTY);
    renderAt("/stats");

    expect(await screen.findByText(/Finish your first focus session/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says when stats couldn't load, and tries again on request", async () => {
    signInAsAna();
    serveStats("error");
    const user = renderAt("/stats");

    // Server errors are retried twice first (see lib/queryClient.ts), so allow a few seconds.
    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent(
      "Couldn't load your stats.",
    );
    serveStats(SOME);
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText("Current streak")).toBeInTheDocument());
  });

  it("is linked from the history list", async () => {
    renderAt("/");

    expect(await screen.findByRole("link", { name: "See your stats" })).toHaveAttribute(
      "href",
      "/stats",
    );
  });
});
