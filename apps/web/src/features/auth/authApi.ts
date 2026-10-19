/** The auth endpoints, as typed functions. */
import { AuthResponseSchema, type LoginInput, type RegisterInput, type User } from "@summit/shared";
import { apiRequest, ApiRequestError } from "../../lib/api";

export async function register(input: RegisterInput): Promise<User> {
  const { user } = await apiRequest("/api/auth/register", {
    method: "POST",
    body: input,
    schema: AuthResponseSchema,
  });
  return user;
}

export async function login(input: LoginInput): Promise<User> {
  const { user } = await apiRequest("/api/auth/login", {
    method: "POST",
    body: input,
    schema: AuthResponseSchema,
  });
  return user;
}

export function logout(): Promise<void> {
  return apiRequest("/api/auth/logout", { method: "POST" });
}

/**
 * Who's signed in? Returns null for guests: "not signed in" is a normal
 * state for this app, not an error.
 */
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const { user } = await apiRequest("/api/auth/me", { schema: AuthResponseSchema });
    return user;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}
