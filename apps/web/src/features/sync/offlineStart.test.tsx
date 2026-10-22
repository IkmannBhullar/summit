// Opening the app while the server can't be reached. A user remembered on
// this device carries on in account mode, and their sessions wait in the
// outbox; nobody remembered means guest mode, as before.
import { metersEarned, type FocusSession, type User } from "@summit/shared";
import { onlineManager } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { server } from "../../test/server";

const MIN = 60_000;
const T0 = Date.parse("2026-10-21T09:00:00.000Z");
const ANA: User = {
  id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
  email: "ana@example.com",
  displayName: "Ana",
  createdAt: "2026-10-18T09:00:00.000Z",
};
const OUTBOX_KEY = `summit:outbox:${ANA.id}`;

/** While true, every API request fails as if the network were down. */
let serverDown: boolean;
/** Who the server says is signed in (when it's up). */
let signedIn: User | null;
let saved: FocusSession[];

const unreachable = () => HttpResponse.error();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(T0);
  serverDown = true;
  signedIn = ANA;
  saved = [];
  server.use(
    http.get("*/api/auth/me", () => {
      if (serverDown) return unreachable();
      return signedIn
        ? HttpResponse.json({ user: signedIn })
        : HttpResponse.json(
            { error: { code: "UNAUTHENTICATED", message: "Sign in." } },
            { status: 401 },
          );
    }),
    http.get("*/api/sessions", () =>
      serverDown ? unreachable() : HttpResponse.json({ sessions: saved, nextCursor: null }),
    ),
    http.get("*/api/climb", () =>
      serverDown
        ? unreachable()
        : HttpResponse.json({
            progress: {
              climbs: [
                {
                  peakId: "mt-fuji",
                  metersGained: saved.reduce((sum, s) => sum + s.metersGained, 0),
                  summitedAt: null,
                },
              ],
            },
          }),
    ),
    // The server never saw the start (it was down), so the finish ends up here.
    http.post("*/api/sessions/:id/complete", () =>
      serverDown
        ? unreachable()
        : HttpResponse.json(
            { error: { code: "NOT_FOUND", message: "Session not found." } },
            { status: 404 },
          ),
    ),
    http.post("*/api/sessions/offline", async ({ request }) => {
      if (serverDown) return unreachable();
      const { sessions } = (await request.json()) as { sessions: FocusSession[] };
      saved.push(...sessions.map((s) => ({ ...s, metersGained: metersEarned(s.status, 25) })));
      return HttpResponse.json({ imported: sessions.length, skipped: 0 });
    }),
    http.post("*/api/sessions", () => (serverDown ? unreachable() : HttpResponse.json({}))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

const remember = (user: User) =>
  localStorage.setItem("summit:signed-in-user", JSON.stringify(user));
// The climb request retries twice before giving up (about 3 s), so the
// offline message isn't instant: a brief blip shouldn't flash a warning.

const outbox = () => JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]") as unknown[];

describe("opening the app while the server can't be reached", () => {
  it("carries on as the remembered user, saying what's unavailable", async () => {
    remember(ANA);
    render(<App />);

    expect(await screen.findByRole("link", { name: "Account (Ana)" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Can't reach Summit right now/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your history will show when Summit can be reached."),
    ).toBeInTheDocument();
  });

  it("keeps sessions finished offline in the account's outbox, then saves them", async () => {
    remember(ANA);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Account (Ana)" });

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    act(() => {
      vi.advanceTimersByTime(25 * MIN);
    });

    expect(
      await screen.findByText(/1 finished session is saved on this device/),
    ).toBeInTheDocument();
    expect(outbox()).toHaveLength(1);

    // The connection comes back.
    serverDown = false;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(
      await screen.findByRole("img", { name: "Climber at 250 m of 3,776 m on Mt. Fuji" }),
    ).toBeInTheDocument();
    expect(saved).toHaveLength(1);
    expect(outbox()).toEqual([]);
  });

  // The bug this fixes: TanStack Query pauses requests while the browser says
  // it's offline, so the page sat on "Loading your climb…" forever.
  it("doesn't hang on loading when the browser itself reports being offline", async () => {
    remember(ANA);
    onlineManager.setOnline(false);
    render(<App />);

    expect(await screen.findByRole("link", { name: "Account (Ana)" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Can't reach Summit right now/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("starts as a guest when nobody was signed in here", async () => {
    render(<App />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  // Being remembered never beats the server: a real "not signed in" wins.
  it("forgets the remembered user when the server says nobody is signed in", async () => {
    remember(ANA);
    serverDown = false;
    signedIn = null;
    render(<App />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem("summit:signed-in-user")).toBe("null");
  });
});
