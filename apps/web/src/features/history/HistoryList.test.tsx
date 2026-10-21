// Tests for the history list: grouping, labels, empty state, and paging.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeSession } from "../../test/fixtures";
import { HISTORY_PAGE_SIZE, HistoryList } from "./HistoryList";

const NOW = new Date("2026-10-17T15:00:00.000Z");

/** Renders the list in en-US so labels are predictable. */
const renderList = (sessions: Parameters<typeof HistoryList>[0]["sessions"]) =>
  render(<HistoryList sessions={sessions} now={NOW} locale="en-US" />);

describe("HistoryList", () => {
  it("shows a friendly empty state", () => {
    renderList([]);

    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
  });

  it("groups sessions by day, newest day and newest session first", () => {
    renderList([
      makeSession("2026-10-16T09:25:00.000Z"),
      makeSession("2026-10-17T09:25:00.000Z"),
      makeSession("2026-10-17T11:25:00.000Z", { status: "ABANDONED" }),
    ]);

    const dayHeadings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(dayHeadings).toEqual(["Today", "Yesterday"]);

    const [today] = screen.getAllByRole("list");
    const rows = within(today!)
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows).toEqual(["11:00 AM · 25 min focus" + "Gave up", "9:00 AM · 25 min focus+250 m"]);
  });

  it("shows each session's tag, read aloud as 'tagged'", () => {
    renderList([makeSession("2026-10-17T09:25:00.000Z", { tag: "LeetCode" })]);

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("LeetCode")).toBeInTheDocument();
    expect(row).toHaveTextContent("25 min focus, tagged LeetCode");
  });

  it("shows meters for completed sessions and 'Gave up' for abandoned ones", () => {
    renderList([
      makeSession("2026-10-17T09:25:00.000Z"),
      makeSession("2026-10-17T10:25:00.000Z", { status: "ABANDONED" }),
    ]);

    expect(screen.getByText("+250 m")).toBeInTheDocument();
    expect(screen.getByText("Gave up")).toBeInTheDocument();
  });

  it("shows one page at a time with a 'Show more' button", async () => {
    const user = userEvent.setup();
    const total = HISTORY_PAGE_SIZE + 5;
    renderList(
      Array.from({ length: total }, (_, i) =>
        makeSession(new Date(Date.parse("2026-10-01T09:00:00.000Z") + i * 3_600_000).toISOString()),
      ),
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(HISTORY_PAGE_SIZE);

    await user.click(screen.getByRole("button", { name: "Show more (5 older)" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(total);
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });
});
