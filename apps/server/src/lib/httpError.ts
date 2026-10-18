/**
 * An error that knows how to become an HTTP response.
 *
 * Route code throws these (`throw new HttpError(404, "NOT_FOUND", "...")`)
 * and the error-handling middleware turns them into the standard JSON shape
 * from @summit/shared. Routes never build error responses by hand, so every
 * error looks the same.
 */
import type { ApiErrorCode } from "@summit/shared";

export class HttpError extends Error {
  constructor(
    /** HTTP status code, e.g. 404. */
    readonly status: number,
    /** Stable machine-readable code from the shared contract. */
    readonly code: ApiErrorCode,
    /** Human-readable message; safe to show to users. */
    message: string,
    /** Per-field problems, for validation errors. */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
