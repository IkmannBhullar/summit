/**
 * Auth state for components, backed by TanStack Query.
 *
 * The signed-in user lives in the query cache under CURRENT_USER_KEY.
 * Logging in or out updates that cache entry directly, so every component
 * that shows the user re-renders immediately, without a refetch.
 */
import type { User } from "@summit/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchCurrentUser, login, logout, register } from "./authApi";

export const CURRENT_USER_KEY = ["auth", "me"] as const;

/**
 * A hint saved on this device: "someone was signed in here last time".
 * Only a flag (no id, email, or token), so it's harmless if read. It lets
 * guests see the timer instantly, without waiting for the server (which can
 * take a while to wake up on free hosting), while signed-in users get a
 * brief "Loading…" instead of a flash of guest data.
 */
const SIGNED_IN_HINT_KEY = "summit:signed-in-hint";

function readSignedInHint(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSignedInHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT_KEY, "1");
    else localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // Storage unavailable: the hint is only an optimization.
  }
}

/**
 * The signed-in user: `undefined` while loading, `null` for guests.
 * Fetched once and shared; re-checked when the tab regains focus, so an
 * expired login shows up as signed out.
 *
 * If the server can't be reached, the user is treated as a guest right
 * away (no retries), so the timer still works offline.
 */
export function useCurrentUser(): {
  user: User | null | undefined;
  isLoading: boolean;
  /** While loading: was someone signed in on this device last time? */
  likelySignedIn: boolean;
} {
  const query = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
    retry: false,
  });

  // Keep the device hint in sync with what the server says.
  useEffect(() => {
    if (query.data !== undefined) writeSignedInHint(query.data !== null);
  }, [query.data]);

  return { user: query.data, isLoading: query.isPending, likelySignedIn: readSignedInHint() };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

/**
 * Signs out. Pages don't need to navigate afterwards: protected pages
 * notice the user is gone and send them home (see RequireAuth).
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(CURRENT_USER_KEY, null);
      // Forget everything cached for the previous user (history, climb...),
      // so the next person on this device never sees it.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    },
  });
}
