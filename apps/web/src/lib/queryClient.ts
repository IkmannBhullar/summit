/**
 * TanStack Query's cache: server data (the signed-in user, history...)
 * fetched once and shared by every component that needs it.
 */
import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./api";

/** Creates the app's query client. A fresh one per app (and per test). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // By default TanStack Query PAUSES requests while the browser says
        // it's offline, so they look "still loading" forever. This app
        // handles "can't reach the server" itself (the remembered user, the
        // outbox, offline messages), so let requests run and fail fast.
        // They're fetched again automatically when the connection returns.
        networkMode: "always",
        // Retry network blips and server errors (5xx) twice, but never
        // client errors (4xx): retrying "wrong password" won't fix it.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500),
      },
      // Mutations (login, start session...) are never retried automatically:
      // repeating a write must be a deliberate choice.
      mutations: { retry: false, networkMode: "always" },
    },
  });
}
