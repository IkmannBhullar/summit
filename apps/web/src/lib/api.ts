/**
 * The one way the web app talks to the server.
 *
 * Every request goes through `apiRequest`, so they all:
 * - send and receive JSON
 * - include the login cookie (`credentials: "include"`)
 * - turn error responses into a typed `ApiRequestError`
 * - validate successful responses against the shared schema, so a server
 *   bug or a mismatched deploy fails loudly here instead of deep in the UI
 */
import { ApiErrorSchema, type ApiErrorCode } from "@summit/shared";
import type { Schema } from "./storage";

/**
 * Where the API lives. Empty in development: Vite's proxy forwards /api to
 * the server, so the app calls its own origin (see vite.config.ts).
 */
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

/** An API call that failed. `code` comes from the shared error contract. */
export class ApiRequestError extends Error {
  constructor(
    /** HTTP status, or 0 when the server couldn't be reached at all. */
    readonly status: number,
    /** The server's error code, or NETWORK_ERROR / BAD_RESPONSE from the client. */
    readonly code: ApiErrorCode | "NETWORK_ERROR" | "BAD_RESPONSE",
    message: string,
    /** Per-field messages for validation errors. */
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface RequestOptions<T> {
  method?: "GET" | "POST";
  /** Sent as JSON. */
  body?: unknown;
  /** Validates (and types) the response. Omit for responses with no body (204). */
  schema?: Schema<T>;
}

/** Calls the API and returns the validated response body. Throws ApiRequestError on failure. */
export async function apiRequest<T = void>(
  path: string,
  { method = "GET", body, schema }: RequestOptions<T> = {},
): Promise<T> {
  // An absolute URL works both in the browser and in tests (Node's fetch
  // can't resolve a bare "/api/..." path on its own).
  const url = new URL(path, API_BASE_URL || window.location.origin);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "Can't reach Summit. Check your connection.");
  }

  // Read the body once; error responses and 204s may not be JSON.
  const text = await response.text();
  const json: unknown = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      const { code, message, fields } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, fields);
    }
    throw new ApiRequestError(
      response.status,
      "INTERNAL_ERROR",
      "Something went wrong. Please try again.",
    );
  }

  if (!schema) return undefined as T;
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiRequestError(
      response.status,
      "BAD_RESPONSE",
      "The server sent something unexpected. Please try again.",
    );
  }
  return result.data;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
