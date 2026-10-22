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
import { ApiRequestError } from "../../lib/api";
import { fetchCurrentUser, login, logout, register } from "./authApi";
import { rememberedUser, rememberUser } from "./rememberedUser";

export const CURRENT_USER_KEY = ["auth", "me"] as const;

/**
 * True when the problem is reaching the server at all (no network, or it's
 * down or waking up), as opposed to the server answering "no".
 */
export function isServerUnreachable(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 0 || error.status >= 500);
}

/**
 * Asks the server who's signed in. If it can't be reached and someone was
 * signed in on this device, carries on as them (see rememberedUser.ts).
 * A real "not signed in" (401) is never overridden: fetchCurrentUser
 * returns null for it.
 */
async function fetchUserOrRemembered(): Promise<User | null> {
  try {
    return await fetchCurrentUser();
  } catch (error) {
    const remembered = rememberedUser();
    if (remembered && isServerUnreachable(error)) return remembered;
    throw error;
  }
}

/**
 * The signed-in user: `undefined` while loading, `null` for guests.
 * Fetched once and shared; re-checked when the tab regains focus, so an
 * expired login shows up as signed out.
 *
 * If the server can't be reached, there's no waiting (no retries): the
 * user who was signed in on this device carries on offline, or, if nobody
 * was, the app starts as a guest. Either way the timer works offline.
 */
export function useCurrentUser(): {
  user: User | null | undefined;
  isLoading: boolean;
  /** Is someone remembered as signed in on this device? (Decides the loading screen.) */
  likelySignedIn: boolean;
} {
  const query = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: fetchUserOrRemembered,
    staleTime: 60_000,
    retry: false,
  });

  // Keep the remembered user in step with what we know (signing in, out, or
  // the server saying the login expired).
  useEffect(() => {
    if (query.data !== undefined) rememberUser(query.data);
  }, [query.data]);

  return {
    user: query.data,
    isLoading: query.isPending,
    likelySignedIn: rememberedUser() !== null,
  };
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
