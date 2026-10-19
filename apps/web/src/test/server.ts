/**
 * A fake API for tests, using MSW (Mock Service Worker). It intercepts
 * fetch() at the network level, so tests exercise the real API client,
 * real JSON, and real error handling, without a running server.
 *
 * By default everyone is a guest (/api/auth/me answers 401). Tests add
 * handlers for what they need with `server.use(...)`.
 */
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const guestHandlers = [
  http.get("*/api/auth/me", () =>
    HttpResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." } },
      { status: 401 },
    ),
  ),
];

export const server = setupServer(...guestHandlers);
