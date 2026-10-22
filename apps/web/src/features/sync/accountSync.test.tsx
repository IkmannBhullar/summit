// Signed-in users: sessions go to the API, and history and climb come back
// from it. MSW plays a small stateful server that applies the same rules as
// the real one (server clock, "too early" check, meters from metersEarned).
import {
  metersEarned,
  progressFromSessions,
  recentTags,
  type FocusSession,
  type User,
} from "@summit/shared";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { makeSession } from "../../test/fixtures";
import { server } from "../../test/server";

const MIN = 60_000;
const T0 = Date.parse("2026-10-18T09:00:00.000Z");
const ANA: User = {
  id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
  email: "ana@example.com",
  displayName: "Ana",
  createdAt: "2026-10-01T09:00:00.000Z",
};

// --- The fake server's state -------------------------------------------------
let signedIn: User | null;
let serverSessions: FocusSession[];
/** Every session-related request, e.g. "POST /api/sessions". */
let requests: string[];
/** Makes the next completion answer SESSION_TOO_EARLY (Retry-After: 1) first. */
let tooEarlyOnce: boolean;
/** Whether the fake server's offline route accepts what it's sent. */
let acceptOffline: boolean;
/** While true, completing or giving up fails as if the network were down. */
let finishNetworkDown: boolean;

const apiError = (status: number, code: string, message: string, headers?: HeadersInit) =>
  HttpResponse.json({ error: { code, message } }, { status, headers });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(T0);
  signedIn = ANA;
  serverSessions = [];
  requests = [];
  tooEarlyOnce = false;
  acceptOffline = true;
  finishNetworkDown = false;
  // This device remembers Ana as signed in (see rememberedUser.ts).
  localStorage.setItem("summit:signed-in-user", JSON.stringify(ANA));

  const record = (request: Request) =>
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  const finishedFor = () => serverSessions.filter((s) => s.status !== "RUNNING");

  server.use(
    http.get("*/api/auth/me", () =>
      signedIn
        ? HttpResponse.json({ user: signedIn })
        : apiError(401, "UNAUTHENTICATED", "Sign in."),
    ),
    http.get("*/api/sessions", ({ request }) => {
      record(request);
      return HttpResponse.json({ sessions: finishedFor(), nextCursor: null });
    }),
    // The outbox's route for sessions the server never saw start.
    http.post("*/api/sessions/offline", async ({ request }) => {
      record(request);
      const { sessions } = (await request.json()) as { sessions: FocusSession[] };
      if (!acceptOffline) return HttpResponse.json({ imported: 0, skipped: sessions.length });
      serverSessions.push(...sessions);
      return HttpResponse.json({ imported: sessions.length, skipped: 0 });
    }),
    http.get("*/api/tags/recent", () => HttpResponse.json({ tags: recentTags(serverSessions) })),
    http.get("*/api/climb", ({ request }) => {
      record(request);
      return HttpResponse.json({ progress: progressFromSessions(serverSessions) });
    }),
    http.post("*/api/sessions", async ({ request }) => {
      record(request);
      const body = (await request.json()) as {
        id: string;
        plannedMinutes: number;
        tag: string | null;
      };
      const session: FocusSession = {
        id: body.id,
        plannedMinutes: body.plannedMinutes,
        startedAt: new Date(Date.now()).toISOString(), // the SERVER's clock
        endedAt: null,
        status: "RUNNING",
        tag: body.tag,
        metersGained: 0,
        roomId: null,
      };
      serverSessions.push(session);
      return HttpResponse.json({ session }, { status: 201 });
    }),
    http.post("*/api/sessions/:id/:action", ({ request, params }) => {
      record(request);
      if (finishNetworkDown) return HttpResponse.error();
      const session = serverSessions.find((s) => s.id === params.id);
      if (!session) return apiError(404, "NOT_FOUND", "Session not found.");
      if (params.action === "complete") {
        if (tooEarlyOnce) {
          tooEarlyOnce = false;
          return apiError(409, "SESSION_TOO_EARLY", "Not yet.", { "Retry-After": "1" });
        }
        Object.assign(session, {
          status: "COMPLETED",
          endedAt: new Date(Date.now()).toISOString(),
          metersGained: metersEarned("COMPLETED", session.plannedMinutes),
        });
      } else {
        Object.assign(session, {
          status: "ABANDONED",
          endedAt: new Date(Date.now()).toISOString(),
        });
      }
      return HttpResponse.json({ session });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

/** Renders the app and waits until the signed-in timer page is ready. */
async function renderSignedIn() {
  render(<App />);
  await screen.findByRole("link", { name: "Account (Ana)" });
  await screen.findByRole("img", { name: /Climber at/ });
  return userEvent.setup();
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const history = () => screen.getByRole("region", { name: "History" });

describe("signed in", () => {
  it("shows history and climb from the account, not this device's guest data", async () => {
    serverSessions = [
      makeSession("2026-10-17T09:25:00.000Z"),
      makeSession("2026-10-17T10:25:00.000Z"),
    ];
    // Guest sessions saved on this device must not appear for the account.
    localStorage.setItem(
      "summit:sessions",
      JSON.stringify([makeSession("2026-10-16T09:25:00.000Z", { plannedMinutes: 50 })]),
    );

    await renderSignedIn();

    expect(
      screen.getByRole("img", { name: "Climber at 500 m of 3,776 m on Mt. Fuji" }),
    ).toBeInTheDocument();
    expect(within(history()).getAllByText("+250 m")).toHaveLength(2);
    expect(within(history()).queryByText("+500 m")).toBeNull();
  });

  it("reports the start and the completion, then shows the server's numbers", async () => {
    const user = await renderSignedIn();

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    await vi.waitFor(() => expect(requests).toContain("POST /api/sessions"));
    advance(25 * MIN);

    expect(
      await screen.findByRole("img", { name: "Climber at 250 m of 3,776 m on Mt. Fuji" }),
    ).toBeInTheDocument();
    expect(requests.filter((r) => r.startsWith("POST"))).toEqual([
      "POST /api/sessions",
      expect.stringMatching(/^POST \/api\/sessions\/.+\/complete$/),
    ]);
    // History and climb are re-fetched in parallel; the climb can arrive
    // first, so wait for history separately (checking it right away made
    // this test fail now and then).
    expect(await within(history()).findByText("+250 m")).toBeInTheDocument();
    // The account was used: nothing was written to this device's guest history.
    expect(JSON.parse(localStorage.getItem("summit:sessions") ?? "[]")).toEqual([]);
  });

  it("sends the same id the timer created", async () => {
    const user = await renderSignedIn();

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    await vi.waitFor(() => expect(serverSessions).toHaveLength(1));

    const timerState = JSON.parse(localStorage.getItem("summit:timer") ?? "{}") as {
      sessionId?: string;
    };
    expect(serverSessions[0]?.id).toBe(timerState.sessionId);
  });

  it("reports giving up", async () => {
    const user = await renderSignedIn();

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(5 * MIN);
    await user.click(screen.getByRole("button", { name: "Give up" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Give up" }));

    await vi.waitFor(() =>
      expect(requests).toContainEqual(expect.stringMatching(/\/abandon$/) as string),
    );
    expect(await within(history()).findByText("Gave up")).toBeInTheDocument();
  });

  // The server started its clock a moment after ours: wait as asked, then retry.
  it("retries a completion the server says is too early, after Retry-After", async () => {
    tooEarlyOnce = true;
    const user = await renderSignedIn();

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(25 * MIN);

    expect(
      await screen.findByRole(
        "img",
        { name: "Climber at 250 m of 3,776 m on Mt. Fuji" },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(requests.filter((r) => r.endsWith("/complete"))).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // The start never reached the server (say the network dropped right then):
  // the outbox saves the finished session through the offline route instead.
  it("saves a session the server never saw start", async () => {
    const user = await renderSignedIn();
    server.use(
      http.post("*/api/sessions", () => HttpResponse.error()),
      http.post("*/api/sessions/:id/complete", () =>
        apiError(404, "NOT_FOUND", "Session not found."),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(25 * MIN);
    window.dispatchEvent(new Event("online"));

    expect(
      await screen.findByRole("img", { name: "Climber at 250 m of 3,776 m on Mt. Fuji" }),
    ).toBeInTheDocument();
    expect(requests).toContain("POST /api/sessions/offline");
  });

  it("says so when the server won't accept a session finished offline", async () => {
    acceptOffline = false;
    const user = await renderSignedIn();
    server.use(
      http.post("*/api/sessions", () => HttpResponse.error()),
      http.post("*/api/sessions/:id/complete", () =>
        apiError(404, "NOT_FOUND", "Session not found."),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(25 * MIN);
    window.dispatchEvent(new Event("online"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A session you finished offline couldn't be added to your account.",
    );
  });

  it("keeps a session on this device while offline, and sends it when back online", async () => {
    const user = await renderSignedIn();
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    await vi.waitFor(() => expect(serverSessions).toHaveLength(1));
    // The connection drops before the session ends.
    finishNetworkDown = true;

    advance(25 * MIN);

    expect(
      await screen.findByText(/1 finished session is saved on this device/),
    ).toBeInTheDocument();
    finishNetworkDown = false;
    window.dispatchEvent(new Event("online"));

    expect(
      await screen.findByRole("img", { name: "Climber at 250 m of 3,776 m on Mt. Fuji" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/saved on this device/)).not.toBeInTheDocument();
  });

  // Each account has its own outbox: never send another person's sessions.
  it("leaves another account's waiting sessions alone", async () => {
    const theirs = makeSession(new Date(T0 - 60 * MIN).toISOString());
    localStorage.setItem(
      "summit:outbox:22222222-2222-4222-8222-222222222222",
      JSON.stringify([{ kind: "finish", session: theirs }]),
    );

    await renderSignedIn();
    await screen.findByRole("region", { name: "History" });

    expect(requests.some((request) => request.includes(theirs.id))).toBe(false);
  });

  // Saved the moment the session ended, so a closed tab or reload loses nothing.
  it("sends a session left waiting from an earlier visit", async () => {
    const waiting = makeSession(new Date(T0 - 60 * MIN).toISOString());
    serverSessions.push({ ...waiting, status: "RUNNING", endedAt: null, metersGained: 0 });
    localStorage.setItem(
      `summit:outbox:${ANA.id}`,
      JSON.stringify([{ kind: "finish", session: waiting }]),
    );

    await renderSignedIn();

    expect(
      await screen.findByRole("img", { name: "Climber at 250 m of 3,776 m on Mt. Fuji" }),
    ).toBeInTheDocument();
    expect(requests).toContain(`POST /api/sessions/${waiting.id}/complete`);
    expect(JSON.parse(localStorage.getItem(`summit:outbox:${ANA.id}`) ?? "null")).toEqual([]);
  });

  // Opening the app mustn't replay celebrations for summits reached long ago.
  it("doesn't celebrate summits the account reached before", async () => {
    serverSessions = Array.from({ length: 16 }, (_, i) =>
      makeSession(new Date(T0 - (i + 1) * 24 * 60 * MIN).toISOString()),
    );

    await renderSignedIn();

    expect(screen.getByRole("img", { name: /on Mt\. Rainier/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /You summited/ })).toBeNull();
  });
});

describe("tags", () => {
  it("offers the account's recent tags and saves the chosen one with the session", async () => {
    serverSessions.push(
      makeSession("2026-10-17T09:25:00.000Z", { tag: "LeetCode" }),
      makeSession("2026-10-17T10:25:00.000Z", { tag: "AWS" }),
    );
    const user = await renderSignedIn();

    const recent = await screen.findByRole("group", { name: "Recent tags" });
    expect(
      within(recent)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["AWS", "LeetCode"]);
    await user.click(within(recent).getByRole("button", { name: "LeetCode" }));
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    await vi.waitFor(() => expect(serverSessions).toHaveLength(3));
    advance(25 * MIN);

    expect(serverSessions[2]?.tag).toBe("LeetCode");
    // The seeded LeetCode session, plus the new one, once history refreshes.
    await vi.waitFor(() => expect(within(history()).getAllByText("LeetCode")).toHaveLength(2));
  });
});

describe("guests", () => {
  it("never touch the session API, and use this device's storage", async () => {
    signedIn = null;
    localStorage.removeItem("summit:signed-in-user");
    render(<App />);
    const user = userEvent.setup();

    // No hint, so the guest timer is there at once (no waiting on the server).
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(25 * MIN);

    expect(await screen.findByText("Session complete: +250 m")).toBeInTheDocument();
    expect(requests).toEqual([]);
    expect(JSON.parse(localStorage.getItem("summit:sessions") ?? "[]")).toHaveLength(1);
  });

  it("tag their sessions on this device, and get them offered next time", async () => {
    signedIn = null;
    localStorage.removeItem("summit:signed-in-user");
    render(<App />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Tag (optional)"), "Rust");
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    advance(25 * MIN);
    // The break comes next (no tags there); skip it to get back to focus.
    await user.click(await screen.findByRole("button", { name: "Skip break" }));

    expect(await screen.findByRole("group", { name: "Recent tags" })).toHaveTextContent("Rust");
    const saved = JSON.parse(localStorage.getItem("summit:sessions") ?? "[]") as { tag: string }[];
    expect(saved[0]?.tag).toBe("Rust");
    expect(requests).toEqual([]);
  });

  it("shows a short loading state for a device that had a signed-in user", async () => {
    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your climb…");
    expect(await screen.findByRole("link", { name: "Account (Ana)" })).toBeInTheDocument();
  });
});
