// End-to-end auth flows through the real app (router, pages, API client),
// with MSW playing a small, stateful fake of the server.
import type { User } from "@summit/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../../App";
import { server } from "../../test/server";

const ANA: User = {
  id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
  email: "ana@example.com",
  displayName: "Ana",
  createdAt: "2026-10-18T09:00:00.000Z",
};
const PASSWORD = "correct horse battery";

/** The fake server's state: who's signed in, and which emails have accounts. */
let signedIn: User | null;
let accounts: Set<string>;
let requests: string[];

const error = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });

beforeEach(() => {
  signedIn = null;
  accounts = new Set([ANA.email]);
  requests = [];
  server.use(
    http.get("*/api/auth/me", () =>
      signedIn ? HttpResponse.json({ user: signedIn }) : error(401, "UNAUTHENTICATED", "Sign in."),
    ),
    http.post("*/api/auth/login", async ({ request }) => {
      requests.push("login");
      const body = (await request.json()) as { email: string; password: string };
      if (body.email !== ANA.email || body.password !== PASSWORD) {
        return error(401, "INVALID_CREDENTIALS", "Wrong email or password.");
      }
      signedIn = ANA;
      return HttpResponse.json({ user: ANA });
    }),
    http.post("*/api/auth/register", async ({ request }) => {
      requests.push("register");
      const body = (await request.json()) as { email: string; displayName: string };
      if (accounts.has(body.email)) {
        const message = "An account with this email already exists.";
        return error(409, "EMAIL_TAKEN", message, { email: message });
      }
      signedIn = { ...ANA, email: body.email, displayName: body.displayName };
      return HttpResponse.json({ user: signedIn }, { status: 201 });
    }),
    http.post("*/api/auth/logout", () => {
      signedIn = null;
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

/** Renders the whole app at a URL. */
function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  render(<App />);
  return userEvent.setup();
}

const field = (name: RegExp) => screen.getByLabelText(name);

describe("signing up", () => {
  it("creates an account and lands on the timer, signed in", async () => {
    const user = renderAt("/register");

    await user.type(await screen.findByLabelText("Email"), "ben@example.com");
    await user.type(field(/display name/i), "Ben");
    await user.type(field(/^password/i), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("link", { name: "Account (Ben)" })).toBeInTheDocument();
    // The redirect happens just after the header updates, so wait for it.
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  // Uses the same shared schema as the server, so bad input never leaves the browser.
  it("checks the form before sending anything", async () => {
    const user = renderAt("/register");

    await user.type(await screen.findByLabelText("Email"), "not-an-email");
    await user.type(field(/^password/i), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(field(/^email/i)).toHaveAccessibleDescription("Enter a valid email address.");
    expect(field(/display name/i)).toHaveAccessibleDescription("Enter a display name.");
    expect(field(/^password/i)).toHaveAccessibleDescription("Use at least 8 characters.");
    expect(requests).toEqual([]);
  });

  it("shows a taken email under the field, with a way to sign in instead", async () => {
    const user = renderAt("/register");

    await user.type(await screen.findByLabelText("Email"), ANA.email);
    await user.type(field(/display name/i), "Ana again");
    await user.type(field(/^password/i), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("link", { name: "Sign in instead?" })).toBeInTheDocument();
    expect(field(/^email/i)).toHaveAccessibleDescription(
      "An account with this email already exists.",
    );
  });
});

describe("signing in", () => {
  it("shows the sign-in link to guests", async () => {
    renderAt("/");

    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("signs in and returns to the timer", async () => {
    const user = renderAt("/login");

    await user.type(await screen.findByLabelText("Email"), ANA.email);
    await user.type(field(/password/i), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("link", { name: "Account (Ana)" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("announces a wrong password", async () => {
    const user = renderAt("/login");

    await user.type(await screen.findByLabelText("Email"), ANA.email);
    await user.type(field(/password/i), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
  });
});

describe("the account page", () => {
  it("sends guests to sign in, then brings them back", async () => {
    const user = renderAt("/account");

    // Redirected to /login…
    await user.type(await screen.findByLabelText("Email"), ANA.email);
    await user.type(field(/password/i), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // …and back to /account afterwards.
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/account");
  });

  it("shows the profile and signs out", async () => {
    signedIn = ANA;
    const user = renderAt("/account");

    expect(await screen.findByText(ANA.email)).toBeInTheDocument();
    expect(screen.getByText(ANA.displayName, { selector: "dd" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    // Back on the timer (not bounced to /login by the protected page).
    expect(await screen.findByRole("timer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(signedIn).toBeNull();
  });
});

describe("guests and offline use", () => {
  // The timer must keep working for guests even if the API is unreachable.
  it("still shows the timer when the server can't be reached", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.error()));
    renderAt("/");

    expect(screen.getByRole("timer")).toHaveTextContent("25:00");
    expect(
      await screen.findByRole("link", { name: "Sign in" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: /account/i })).toBeNull();
  });
});
