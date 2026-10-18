// Tests for the shared error shape and the field-error helper.
import { describe, expect, it } from "vitest";
import { RegisterInputSchema } from "./auth";
import { ApiErrorSchema, fieldErrors } from "./errors";

describe("ApiErrorSchema", () => {
  it("accepts the standard error shape", () => {
    expect(
      ApiErrorSchema.safeParse({
        error: { code: "VALIDATION_ERROR", message: "Check the form.", fields: { email: "Bad" } },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown error code", () => {
    expect(
      ApiErrorSchema.safeParse({ error: { code: "OOPS", message: "Something" } }).success,
    ).toBe(false);
  });
});

describe("fieldErrors", () => {
  it("maps each invalid field to its first message", () => {
    const result = RegisterInputSchema.safeParse({
      email: "nope",
      password: "short",
      displayName: "",
    });

    expect(fieldErrors(result.error!.issues)).toEqual({
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
      displayName: "Enter a display name.",
    });
  });

  it("uses '_' for problems with the whole body, not one field", () => {
    const result = RegisterInputSchema.safeParse("not an object");

    expect(Object.keys(fieldErrors(result.error!.issues))).toEqual(["_"]);
  });
});
