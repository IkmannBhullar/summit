/**
 * The one error shape every API endpoint uses:
 *
 *   { "error": { "code": "EMAIL_TAKEN", "message": "...", "fields": { ... } } }
 *
 * - `code` is for code: stable, so the client can branch on it.
 * - `message` is for people: safe to show in the UI.
 * - `fields` (validation errors only) maps a form field to its problem.
 */
import { z } from "zod";

export const API_ERROR_CODES = [
  /** The request body or query failed validation (HTTP 400). */
  "VALIDATION_ERROR",
  /** Not signed in, or the session cookie is invalid or expired (401). */
  "UNAUTHENTICATED",
  /** Wrong email or password. Deliberately doesn't say which (401). */
  "INVALID_CREDENTIALS",
  /** An account with this email already exists (409). */
  "EMAIL_TAKEN",
  /** The thing doesn't exist, or belongs to someone else (404). */
  "NOT_FOUND",
  /** The request conflicts with the current state, e.g. completing an abandoned session (409). */
  "CONFLICT",
  /** A session was reported complete before its planned time had passed (409). */
  "SESSION_TOO_EARLY",
  /** Too many attempts; try again later (429). */
  "RATE_LIMITED",
  /** The request must be sent as JSON (415). */
  "UNSUPPORTED_MEDIA_TYPE",
  /** The request body is bigger than the server accepts (413). */
  "PAYLOAD_TOO_LARGE",
  /** Something went wrong on the server (500). */
  "INTERNAL_ERROR",
] as const;

export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Turns Zod's detailed issues into `{ field: message }`, one message per
 * field (the first problem found), for showing under form inputs.
 */
export function fieldErrors(issues: readonly z.core.$ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "_";
    fields[field] ??= issue.message;
  }
  return fields;
}
