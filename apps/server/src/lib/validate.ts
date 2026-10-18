/**
 * Validates request data against a shared Zod schema.
 *
 * On success it returns the parsed, typed value (with defaults applied and
 * unknown fields removed). On failure it throws a 400 VALIDATION_ERROR that
 * lists each bad field, which the error handler sends back as JSON.
 */
import { fieldErrors } from "@summit/shared";
import type { z } from "zod";
import { HttpError } from "./httpError";

export function validate<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
): z.output<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Some fields need fixing.",
      fieldErrors(result.error.issues),
    );
  }
  return result.data;
}
