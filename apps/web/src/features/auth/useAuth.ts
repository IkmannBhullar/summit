/**
 * Auth state for components, backed by TanStack Query.
 *
 * The signed-in user lives in the query cache under CURRENT_USER_KEY.
 * Logging in or out updates that cache entry directly, so every component
 * that shows the user re-renders immediately, without a refetch.
 */
import type { User } from "@summit/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUser, login, logout, register } from "./authApi";

export const CURRENT_USER_KEY = ["auth", "me"] as const;

/**
 * The signed-in user: `undefined` while loading, `null` for guests.
 * Fetched once and shared; re-checked when the tab regains focus, so an
 * expired login shows up as signed out.
 */
export function useCurrentUser(): { user: User | null | undefined; isLoading: boolean } {
  const query = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: fetchCurrentUser,
    staleTime: 60_000,
  });
  return { user: query.data, isLoading: query.isPending };
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
