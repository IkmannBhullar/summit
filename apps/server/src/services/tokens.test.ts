// Tests for login tokens, including the classic ways JWTs get attacked.
import { SignJWT, UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createTokenService, sessionCookieOptions } from "./tokens";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const tokens = createTokenService(SECRET);
const USER = "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e";
const key = new TextEncoder().encode(SECRET);

describe("token service", () => {
  it("round-trips a user id", async () => {
    const token = await tokens.sign(USER);

    await expect(tokens.verify(token)).resolves.toBe(USER);
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = await createTokenService("a-different-secret-also-32-characters!").sign(USER);

    await expect(tokens.verify(forged)).resolves.toBeNull();
  });

  // Editing the payload (e.g. to become another user) breaks the signature.
  it("rejects a token whose payload was edited", async () => {
    const [header, , signature] = (await tokens.sign(USER)).split(".");
    const evilPayload = Buffer.from(JSON.stringify({ sub: "someone-else" })).toString("base64url");

    await expect(tokens.verify(`${header}.${evilPayload}.${signature}`)).resolves.toBeNull();
  });

  // The famous "alg: none" attack: an unsigned token claiming to need no signature.
  it("rejects an unsigned 'alg: none' token", async () => {
    const unsigned = new UnsecuredJWT()
      .setSubject(USER)
      .setIssuer("summit-api")
      .setAudience("summit-web")
      .setExpirationTime("1h")
      .encode();

    await expect(tokens.verify(unsigned)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER)
      .setIssuer("summit-api")
      .setAudience("summit-web")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60) // a minute ago
      .sign(key);

    await expect(tokens.verify(expired)).resolves.toBeNull();
  });

  it("rejects a correctly signed token meant for a different app", async () => {
    const otherApp = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(USER)
      .setIssuer("some-other-service")
      .setAudience("summit-web")
      .setExpirationTime("1h")
      .sign(key);

    await expect(tokens.verify(otherApp)).resolves.toBeNull();
  });

  it.each(["", "garbage", "a.b.c"])("rejects junk like %j without throwing", async (junk) => {
    await expect(tokens.verify(junk)).resolves.toBeNull();
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly and SameSite=Lax, valid for 7 days", () => {
    expect(sessionCookieOptions(false)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  });

  it("is Secure (HTTPS-only) in production", () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
  });
});
