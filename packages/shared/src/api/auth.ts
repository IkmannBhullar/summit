/**
 * Request and response shapes for the auth API (/api/auth/...).
 *
 * The server validates every request with these schemas, and the web app
 * uses the same ones for its forms, so both sides apply identical rules.
 */
import { z } from "zod";

/** bcrypt ignores everything after the first 72 bytes of a password. */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MIN_LENGTH = 8;
export const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Counts how many bytes a string takes in UTF-8 (what bcrypt sees).
 * "a" is 1 byte, "é" is 2, "€" is 3, and most emoji are 4.
 *
 * Written by hand because TextEncoder isn't available to this package's
 * types (it runs in both the browser and Node).
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  // for...of walks real characters (code points), so an emoji counts once.
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Emails are trimmed and lowercased first, so "Ana@X.com " and "ana@x.com" are one account. */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address." }).max(254));

/** Rules for choosing a new password. */
export const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .refine((password) => utf8ByteLength(password) <= PASSWORD_MAX_BYTES, {
    message: "That password is too long.",
  });

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, { message: "Enter a display name." })
  .max(DISPLAY_NAME_MAX_LENGTH, {
    message: `Keep it under ${DISPLAY_NAME_MAX_LENGTH} characters.`,
  });

/** POST /api/auth/register */
export const RegisterInputSchema = z.object({
  email: EmailSchema,
  password: NewPasswordSchema,
  displayName: DisplayNameSchema,
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

/**
 * POST /api/auth/login
 *
 * The password is only checked for being present (not the sign-up rules):
 * login should simply say "wrong email or password", without hinting at
 * what valid passwords look like.
 */
export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, { message: "Enter your password." }).max(1000),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** The user as the API returns it: never includes the password hash. */
export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;

/** Response to register, login, and GET /api/auth/me. */
export const AuthResponseSchema = z.object({ user: UserSchema });
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
