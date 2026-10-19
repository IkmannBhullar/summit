// Helpers for showing auth errors in forms. (Kept out of the component
// files so Vite's Fast Refresh can still hot-swap those.)
import { fieldErrors } from "@summit/shared";
import type { z } from "zod";
import { ApiRequestError } from "../../lib/api";

/** Validates form values with a shared schema; returns either data or per-field errors. */
export function validateForm<Schema extends z.ZodType>(
  schema: Schema,
  values: unknown,
): { data: z.output<Schema>; errors: null } | { data: null; errors: Record<string, string> } {
  const result = schema.safeParse(values);
  return result.success
    ? { data: result.data, errors: null }
    : { data: null, errors: fieldErrors(result.error.issues) };
}

/** A message for the whole form, for errors that aren't about one field. */
export function formErrorMessage(error: unknown): string {
  return error instanceof ApiRequestError
    ? error.message
    : "Something went wrong. Please try again.";
}

/** Per-field messages from a server validation error, if any. */
export function serverFieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiRequestError ? error.fields : {};
}
