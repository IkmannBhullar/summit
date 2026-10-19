/**
 * Auth routes, mounted at /api/auth:
 *
 *   POST /register  create an account and sign in       → 201 { user }
 *   POST /login     sign in                             → 200 { user }
 *   POST /logout    sign out (always succeeds)          → 204
 *   GET  /me        who am I?                           → 200 { user } or 401
 *
 * Signing in = setting the httpOnly login cookie. The client never sees or
 * stores the token itself.
 */
import {
  LoginInputSchema,
  RegisterInputSchema,
  type AuthResponse,
  type User,
} from "@summit/shared";
import { Router, type RequestHandler, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { Config } from "../config/env";
import type { PrismaClient } from "../db/client";
import { Prisma } from "../generated/prisma/client";
import { HttpError } from "../lib/httpError";
import { validate } from "../lib/validate";
import { signedInUserId } from "../middleware/auth";
import type { PasswordService } from "../services/passwords";
import { SESSION_COOKIE, sessionCookieOptions, type TokenService } from "../services/tokens";

/** Limits for login/register attempts per IP address. */
export interface RateLimitSettings {
  windowMs: number;
  limit: number;
}

/** 10 attempts per 15 minutes per IP: plenty for people, far too slow for password guessing. */
export const DEFAULT_AUTH_RATE_LIMIT: RateLimitSettings = { windowMs: 15 * 60 * 1000, limit: 10 };

export interface AuthRouterDependencies {
  config: Config;
  prisma: PrismaClient;
  passwords: PasswordService;
  tokens: TokenService;
  requireAuth: RequestHandler;
  rateLimit: RateLimitSettings;
}

/** The public shape of a user: never the password hash. */
function toUserDto(user: {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

export function createAuthRouter(deps: AuthRouterDependencies): Router {
  const { config, prisma, passwords, tokens, requireAuth } = deps;
  const router = Router();
  const cookieOptions = sessionCookieOptions(config.isProduction);

  /** Signs the user in by setting the login cookie. */
  async function startSession(res: Response, userId: string) {
    res.cookie(SESSION_COOKIE, await tokens.sign(userId), cookieOptions);
  }

  // Slow down password guessing and mass sign-ups from one address.
  const authAttemptLimiter = rateLimit({
    windowMs: deps.rateLimit.windowMs,
    limit: deps.rateLimit.limit,
    // Send the standard `RateLimit` / `RateLimit-Policy` headers so clients
    // can see how long to wait.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Answer in our standard error shape instead of the library's plain text.
    handler: (_req, _res, next) => {
      next(new HttpError(429, "RATE_LIMITED", "Too many attempts. Please wait a few minutes."));
    },
  });

  router.post("/register", authAttemptLimiter, async (req, res) => {
    const input = validate(RegisterInputSchema, req.body);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash: await passwords.hash(input.password),
          displayName: input.displayName,
        },
      });
    } catch (error) {
      // P2002 = unique constraint violated: this email already has an account.
      // Relying on the database (not a "check first" query) also handles two
      // sign-ups with the same email arriving at the same moment.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.", {
          email: "An account with this email already exists.",
        });
      }
      throw error;
    }

    await startSession(res, user.id);
    const body: AuthResponse = { user: toUserDto(user) };
    res.status(201).json(body);
  });

  router.post("/login", authAttemptLimiter, async (req, res) => {
    const input = validate(LoginInputSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    // Same work and the same answer whether the email is unknown or the
    // password is wrong, so attackers can't use login to discover accounts.
    const valid = user
      ? await passwords.verify(input.password, user.passwordHash)
      : await passwords.verifyAgainstDummy(input.password);
    if (!user || !valid) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Wrong email or password.");
    }

    await startSession(res, user.id);
    const body: AuthResponse = { user: toUserDto(user) };
    res.json(body);
  });

  // Logging out just deletes the cookie. It always succeeds, even when not
  // signed in, so a client can call it without checking first.
  router.post("/logout", (_req, res) => {
    // clearCookie needs the same path/sameSite/secure options to match, but not maxAge.
    const { maxAge: _maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie(SESSION_COOKIE, clearOptions);
    res.status(204).end();
  });

  router.get("/me", requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: signedInUserId(req) } });
    // A valid token for a deleted account: treat as signed out.
    if (!user) {
      throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
    }
    const body: AuthResponse = { user: toUserDto(user) };
    res.json(body);
  });

  return router;
}
