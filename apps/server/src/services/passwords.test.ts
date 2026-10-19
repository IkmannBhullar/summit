// Tests for password hashing.
import { getRounds } from "bcryptjs";
import { describe, expect, it } from "vitest";
import { createPasswordService } from "./passwords";

const passwords = createPasswordService(4);

describe("password service", () => {
  it("hashes with bcrypt and the configured cost, never storing the password", async () => {
    const hashed = await passwords.hash("correct horse");

    expect(hashed).toMatch(/^\$2[aby]\$04\$/);
    expect(hashed).not.toContain("correct horse");
    expect(getRounds(hashed)).toBe(4);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hashed = await passwords.hash("correct horse");

    await expect(passwords.verify("correct horse", hashed)).resolves.toBe(true);
    await expect(passwords.verify("Correct horse", hashed)).resolves.toBe(false);
  });

  // A random salt per hash: two users with the same password get different hashes.
  it("salts each hash differently", async () => {
    const [first, second] = await Promise.all([
      passwords.hash("same password"),
      passwords.hash("same password"),
    ]);

    expect(first).not.toBe(second);
  });

  it("never matches the dummy hash", async () => {
    await expect(passwords.verifyAgainstDummy("anything")).resolves.toBe(false);
  });

  // The timing defense only works if the dummy check costs the same as a real one.
  it("spends about as long on the dummy check as on a real one", async () => {
    const slow = createPasswordService(10);
    const real = await slow.hash("correct horse");
    await slow.verifyAgainstDummy("warm up"); // the first call also builds the dummy hash

    const time = async (check: () => Promise<boolean>) => {
      const start = performance.now();
      await check();
      return performance.now() - start;
    };
    const realMs = await time(() => slow.verify("wrong guess", real));
    const dummyMs = await time(() => slow.verifyAgainstDummy("wrong guess"));

    // Generous bounds so a busy machine can't make this flaky.
    expect(dummyMs).toBeGreaterThan(realMs * 0.5);
    expect(dummyMs).toBeLessThan(realMs * 2);
  });
});
