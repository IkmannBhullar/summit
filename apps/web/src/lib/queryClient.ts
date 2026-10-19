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
        // Retry network blips and server errors (5xx) twice, but never
        // client errors (4xx): retrying "wrong password" won't fix it.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500),
      },
      // Mutations (login, start session...) are never retried automatically:
      // repeating a write must be a deliberate choice.
      mutations: { retry: false },
    },
  });
}
