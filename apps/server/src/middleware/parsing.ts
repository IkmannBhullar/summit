/**
 * How incoming requests are read: JSON bodies only, with a size limit, plus
 * cookies (the login token will live in one).
 */
import cookieParser from "cookie-parser";
import express, { type Express, type RequestHandler } from "express";
import { HttpError } from "../lib/httpError";

/**
 * Largest accepted body. Big enough for a full guest-history import (1,000
 * sessions at roughly 250 bytes each), small enough that nobody can tie up
 * the server by uploading huge payloads.
 */
export const MAX_BODY_SIZE = "1mb";

/** True if the request carries a body (sent with a length, or streamed in chunks). */
function hasBody(req: Parameters<RequestHandler>[0]): boolean {
  const length = req.headers["content-length"];
  return (length !== undefined && length !== "0") || req.headers["transfer-encoding"] !== undefined;
}

/**
 * Rejects request bodies that aren't JSON with 415 Unsupported Media Type.
 *
 * Besides clearer errors, this is a CSRF defense: another website can make a
 * browser submit an HTML <form> to our API with the user's cookies attached,
 * but HTML forms can't send `Content-Type: application/json`, so such forged
 * requests are refused. (Requests with no body, like logout, are fine.)
 */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  if (hasBody(req) && !req.is("application/json")) {
    next(new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request body as JSON."));
    return;
  }
  next();
};

/** Adds body and cookie parsing. Call before registering routes. */
export function installRequestParsing(app: Express): void {
  app.use(requireJsonBody);
  // Parses JSON bodies into req.body (and rejects ones over the size limit).
  app.use(express.json({ limit: MAX_BODY_SIZE }));
  // Parses the Cookie header into req.cookies.
  app.use(cookieParser());
}
