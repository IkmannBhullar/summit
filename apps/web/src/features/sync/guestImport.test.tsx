// The "import this device's guest history?" offer, through the real app,
// with MSW as the server.
import { progressFromSessions, type FocusSession, type User } from "@summit/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";
import { makeSession } from "../../test/fixtures";
import { server } from "../../test/server";

const ANA: User = {
  id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
  email: "ana@example.com",
  displayName: "Ana",
  createdAt: "2026-10-18T09:00:00.000Z",
};
const BEN: User = { ...ANA, id: "1c8d6e2f-9a5b-4d4c-8e3f-2b7a8c9d0e1f", displayName: "Ben" };

let signedIn: User | null;
let accountSessions: FocusSession[];
/** What the last import request contained. */
let importedBodies: FocusSession[][];
/** How many of each import the fake server should skip. */
let skipCount: number;

beforeEach(() => {
  signedIn = ANA;
  accountSessions = [];
  importedBodies = [];
  skipCount = 0;
  // This device remembers Ana as signed in (see rememberedUser.ts).
  localStorage.setItem("summit:signed-in-user", JSON.stringify(ANA));

  server.use(
    http.get("*/api/auth/me", () =>
      signedIn
        ? HttpResponse.json({ user: signedIn })
        : HttpResponse.json(
            { error: { code: "UNAUTHENTICATED", message: "Sign in." } },
            { status: 401 },
          ),
    ),
    http.get("*/api/sessions", () =>
      HttpResponse.json({ sessions: accountSessions, nextCursor: null }),
    ),
    http.get("*/api/climb", () =>
      HttpResponse.json({ progress: progressFromSessions(accountSessions) }),
    ),
    http.post("*/api/sessions/import", async ({ request }) => {
      const { sessions } = (await request.json()) as { sessions: FocusSession[] };
      importedBodies.push(sessions);
      const accepted = sessions.slice(skipCount);
      accountSessions.push(...accepted);
      return HttpResponse.json({
        imported: accepted.length,
        skipped: sessions.length - accepted.length,
      });
    }),
  );
});

/** Saves guest sessions on this "device", as Phase 1 did. */
function saveGuestSessions(count: number) {
  const sessions = Array.from({ length: count }, (_, i) =>
    makeSession(new Date(Date.parse("2026-10-10T09:25:00.000Z") + i * 3_600_000).toISOString()),
  );
  localStorage.setItem("summit:sessions", JSON.stringify(sessions));
  return sessions;
}

async function renderApp() {
  const view = render(<App />);
  await screen.findByRole("img", { name: /Climber at/ });
  return Object.assign(userEvent.setup(), { unmount: view.unmount });
}

const offer = () => screen.queryByRole("region", { name: "Bring your climb with you?" });

describe("importing guest history", () => {
  it("offers to import this device's sessions after signing in", async () => {
    saveGuestSessions(3);

    await renderApp();

    expect(offer()).toHaveTextContent("This device has 3 sessions from before you signed in.");
    expect(screen.getByRole("button", { name: "Import 3 sessions" })).toBeInTheDocument();
  });

  it("imports them, shows the result, refreshes the climb, and clears the device copy", async () => {
    const guestSessions = saveGuestSessions(3);
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Import 3 sessions" }));
    expect(await screen.findByText("Imported 3 sessions into your account.")).toBeInTheDocument();
    expect(importedBodies).toEqual([guestSessions]);
    expect(
      await screen.findByRole("img", { name: "Climber at 750 m of 3,776 m on Mt. Fuji" }),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("summit:sessions") ?? "[]")).toEqual([]);
    expect(offer()).toBeNull();
  });

  it("explains when the server skipped some sessions", async () => {
    saveGuestSessions(4);
    skipCount = 1;
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Import 4 sessions" }));

    expect(
      await screen.findByText(
        "Imported 3 sessions into your account. 1 session couldn't be imported (they overlapped other sessions or happened after your account was created).",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the device copy and says so when the import fails", async () => {
    saveGuestSessions(2);
    server.use(
      http.post("*/api/sessions/import", () =>
        HttpResponse.json(
          { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side." } },
          { status: 500 },
        ),
      ),
    );
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Import 2 sessions" }));

    expect(await within(offer()!).findByRole("alert")).toHaveTextContent(
      "Import failed: Something went wrong on our side.",
    );
    expect(JSON.parse(localStorage.getItem("summit:sessions") ?? "[]")).toHaveLength(2);
  });

  it("remembers 'Not now' for this account only", async () => {
    saveGuestSessions(2);
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(offer()).toBeNull();
    expect(importedBodies).toEqual([]);

    // Ana again, like after a reload: still declined.
    user.unmount();
    await renderApp();
    expect(offer()).toBeNull();
  });

  it("still offers the import to a different account on the same device", async () => {
    saveGuestSessions(2);
    localStorage.setItem(
      "summit:preferences",
      JSON.stringify({
        soundEnabled: true,
        notificationPromptDismissed: false,
        importDeclinedFor: [ANA.id],
      }),
    );
    signedIn = BEN;

    await renderApp();

    expect(offer()).not.toBeNull();
  });

  it("doesn't offer anything when the device has no guest sessions", async () => {
    await renderApp();

    expect(offer()).toBeNull();
  });

  it("doesn't offer importing to guests", async () => {
    saveGuestSessions(2);
    signedIn = null;
    localStorage.removeItem("summit:signed-in-user");

    render(<App />);
    await screen.findByRole("link", { name: "Sign in" });

    expect(offer()).toBeNull();
  });

  // Preferences saved before this feature existed must stay valid.
  it("keeps older saved preferences (without the new field) instead of resetting them", async () => {
    localStorage.setItem(
      "summit:preferences",
      JSON.stringify({ soundEnabled: false, notificationPromptDismissed: true }),
    );

    await renderApp();

    expect(screen.getByRole("button", { name: "Sound" })).toHaveAttribute("aria-pressed", "false");
  });
});
