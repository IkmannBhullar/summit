/**
 * Password hashing with bcrypt (the pure-JavaScript `bcryptjs`).
 *
 * We never store passwords, only a bcrypt "hash": a one-way scramble that
 * includes a random salt and the cost factor, e.g. "$2b$12$...". To check a
 * login, bcrypt re-hashes the attempt with the same salt and compares.
 *
 * The salt makes every hash unique, even for identical passwords, so
 * precomputed "rainbow tables" are useless. The cost factor makes each guess
 * slow, so brute-forcing a stolen hash is expensive.
 */
import { compare, hash } from "bcryptjs";
import { randomUUID } from "node:crypto";

export interface PasswordService {
  /** Hashes a new password with the configured cost factor. */
  hash: (password: string) => Promise<string>;
  /** Checks a password attempt against a stored hash. */
  verify: (password: string, passwordHash: string) => Promise<boolean>;
  /**
   * Spends the same time as a real check, for logins with an unknown email.
   *
   * Otherwise "no such account" would answer instantly while "wrong
   * password" takes ~250 ms, and an attacker could time responses to learn
   * which emails have accounts. Always returns false.
   */
  verifyAgainstDummy: (password: string) => Promise<false>;
}

/** @param rounds - bcrypt cost factor from config (12 normally, 4 in tests). */
export function createPasswordService(rounds: number): PasswordService {
  // A hash of a random value nobody knows, made with the SAME cost as real
  // hashes, so comparing against it takes exactly as long. Created once;
  // the first unknown-email login waits for it.
  const dummyHash = hash(randomUUID(), rounds);

  return {
    hash: (password) => hash(password, rounds),
    verify: (password, passwordHash) => compare(password, passwordHash),
    verifyAgainstDummy: async (password) => {
      await compare(password, await dummyHash);
      return false;
    },
  };
}
