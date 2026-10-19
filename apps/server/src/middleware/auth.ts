/**
 * Who's making this request? Two middlewares:
 *
 * - `authenticate` runs on every request: if a valid login cookie is
 *   present, it sets `req.userId`. It never rejects anything by itself.
 * - `requireAuth` goes on routes that need a signed-in user: no `req.userId`
 *   means 401.
 */
import type { RequestHandler } from "express";
import { HttpError } from "../lib/httpError";
import { SESSION_COOKIE, type TokenService } from "../services/tokens";

// Teach TypeScript that Express requests can carry the signed-in user's id.
// This "declaration merging" adds a field to Express's own Request type.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the standard way to extend Express's types
  namespace Express {
    interface Request {
      /** Set by `authenticate` when the request has a valid login cookie. */
      userId?: string;
    }
  }
}

export function createAuthMiddleware(tokens: TokenService) {
  const authenticate: RequestHandler = async (req, _res, next) => {
    const token: unknown = (req.cookies as Record<string, unknown>)[SESSION_COOKIE];
    if (typeof token === "string") {
      const userId = await tokens.verify(token);
      if (userId) req.userId = userId;
    }
    next();
  };

  const requireAuth: RequestHandler = (req, _res, next) => {
    if (!req.userId) {
      next(new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue."));
      return;
    }
    next();
  };

  return { authenticate, requireAuth };
}

/**
 * Inside a route behind `requireAuth`: the signed-in user's id. Throws if
 * it's missing (that would mean requireAuth was forgotten on the route).
 */
export function signedInUserId(req: Express.Request): string {
  if (!req.userId) {
    throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  }
  return req.userId;
}
