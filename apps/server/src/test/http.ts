// Helpers for reading Supertest responses in a typed way.
import { ApiErrorSchema, type ApiError } from "@summit/shared";
import type { Response } from "supertest";

/**
 * Returns the `error` object of an API error response.
 *
 * Parsing with the shared schema (instead of reading `res.body` directly)
 * gives TypeScript real types AND fails the test if the server ever sends
 * an error that doesn't match the API contract.
 */
export function apiError(res: Response): ApiError["error"] {
  return ApiErrorSchema.parse(res.body).error;
}
