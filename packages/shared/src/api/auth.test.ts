// Tests for the auth API schemas.
import { describe, expect, it } from "vitest";
import {
  LoginInputSchema,
  PASSWORD_MAX_BYTES,
  RegisterInputSchema,
  UserSchema,
  utf8ByteLength,
} from "./auth";

const valid = { email: "ana@example.com", password: "correct horse", displayName: "Ana" };

/** The first error message for a field, or undefined if the input is valid. */
const errorFor = (input: unknown, field: string) =>
  RegisterInputSchema.safeParse(input).error?.issues.find((issue) => issue.path[0] === field)
    ?.message;

describe("utf8ByteLength", () => {
  it.each([
    ["a", 1],
    ["é", 2],
    ["€", 3],
    ["🏔️", 7], // mountain (4 bytes) + an invisible "show as emoji" marker (3 bytes)
    ["climb", 5],
  ])("counts %s as %d bytes", (text, bytes) => {
    expect(utf8ByteLength(text)).toBe(bytes);
  });
});

describe("RegisterInputSchema", () => {
  it("accepts a valid registration", () => {
    expect(RegisterInputSchema.safeParse(valid).success).toBe(true);
  });

  // "Ana@Example.com " and "ana@example.com" must be the same account.
  it("trims and lowercases the email", () => {
    const parsed = RegisterInputSchema.parse({ ...valid, email: "  Ana@Example.COM " });

    expect(parsed.email).toBe("ana@example.com");
  });

  it("trims the display name", () => {
    expect(RegisterInputSchema.parse({ ...valid, displayName: "  Ana  " }).displayName).toBe("Ana");
  });

  it.each([
    ["email", { email: "not-an-email" }, "Enter a valid email address."],
    ["password", { password: "short" }, "Use at least 8 characters."],
    ["displayName", { displayName: "   " }, "Enter a display name."],
    ["displayName", { displayName: "x".repeat(41) }, "Keep it under 40 characters."],
  ])("rejects a bad %s with a friendly message", (field, override, message) => {
    expect(errorFor({ ...valid, ...override }, field)).toBe(message);
  });

  // bcrypt silently ignores bytes after 72, so longer passwords are refused.
  it("accepts a password of exactly 72 bytes", () => {
    expect(errorFor({ ...valid, password: "a".repeat(PASSWORD_MAX_BYTES) }, "password")).toBe(
      undefined,
    );
  });

  it("rejects a password over 72 bytes, counting bytes, not characters", () => {
    // 37 characters, but each "é" is 2 bytes: 74 bytes in total.
    const accented = "é".repeat(37);
    expect(accented.length).toBe(37);

    expect(errorFor({ ...valid, password: accented }, "password")).toBe(
      "That password is too long.",
    );
  });
});

describe("LoginInputSchema", () => {
  // Login mustn't reveal the sign-up rules: any non-empty password is checked.
  it("accepts a short password (the server just says it's wrong)", () => {
    expect(LoginInputSchema.safeParse({ email: "ana@example.com", password: "x" }).success).toBe(
      true,
    );
  });

  it("requires a password", () => {
    expect(LoginInputSchema.safeParse({ email: "ana@example.com", password: "" }).success).toBe(
      false,
    );
  });
});

describe("UserSchema", () => {
  it("has no place for a password hash", () => {
    const parsed = UserSchema.parse({
      id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
      email: "ana@example.com",
      displayName: "Ana",
      createdAt: "2026-10-18T09:00:00.000Z",
      passwordHash: "$2b$12$should-never-leave-the-server",
    });

    // Zod objects drop unknown keys, so a leaked field can't pass through.
    expect(parsed).not.toHaveProperty("passwordHash");
  });
});
