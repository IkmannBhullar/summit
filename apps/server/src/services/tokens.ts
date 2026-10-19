/**
 * Login tokens: signed JWTs (JSON Web Tokens) carried in a cookie.
 *
 * A JWT is three base64 parts, header.payload.signature. The payload says
 * "user X, valid until Y"; the signature is an HMAC of the first two parts
 * made with our secret. Changing any byte of the payload breaks the
 * signature, so a client can read its token but can't forge or edit one.
 */
import type { CookieOptions } from "express";
import { jwtVerify, SignJWT } from "jose";

/** Name of the cookie that holds the login token. */
export const SESSION_COOKIE = "summit_session";

/** How long a login lasts before signing in again. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Extra claims that tie tokens to this app, so a token minted for some other
// service with the same secret (or a copy-paste mistake) is rejected.
const ISSUER = "summit-api";
const AUDIENCE = "summit-web";

export interface TokenService {
  /** Creates a signed token for a user. */
  sign: (userId: string) => Promise<string>;
  /** Returns the user id from a valid token, or null if it's invalid, expired, or forged. */
  verify: (token: string) => Promise<string | null>;
}

export function createTokenService(secret: string): TokenService {
  // jose works with bytes, not strings.
  const key = new TextEncoder().encode(secret);

  return {
    sign: (userId) =>
      new SignJWT()
        // HS256 = HMAC with SHA-256: one shared secret both signs and verifies.
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId) // "sub": who this token is about
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
        .sign(key),

    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, {
          // Only accept HS256. Allowing any algorithm a token claims (like
          // "none") is a classic JWT vulnerability.
          algorithms: ["HS256"],
          issuer: ISSUER,
          audience: AUDIENCE,
        });
        return payload.sub ?? null;
      } catch {
        // Bad signature, expired, wrong issuer, or not a JWT at all.
        return null;
      }
    },
  };
}

/**
 * Cookie settings for the login token.
 *
 * - httpOnly: page JavaScript can't read it, so an injected script (XSS)
 *   can't steal the token.
 * - sameSite "lax": the browser doesn't send it with cross-site POSTs or
 *   background requests, a strong CSRF defense. It IS sent when you click a
 *   link to the site, so you stay logged in when arriving from elsewhere.
 * - secure (production only): HTTPS-only. Local dev uses plain http, where
 *   a Secure cookie would never be sent.
 */
export function sessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000, // Express takes milliseconds here
  };
}
