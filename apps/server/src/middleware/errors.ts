/**
 * The last two middlewares in the app: a 404 for unknown routes, and the
 * error handler that turns anything thrown into the standard JSON shape.
 */
import type { ApiError } from "@summit/shared";
import type { ErrorRequestHandler, Express, RequestHandler } from "express";
import { HttpError } from "../lib/httpError";

/** No route matched: answer with a JSON 404 (not Express's default HTML page). */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

/**
 * Converts errors into responses. Express recognizes error handlers by
 * their FOUR parameters (err, req, res, next), so all four must stay.
 *
 * Express 5 also sends errors thrown in `async` route handlers here
 * automatically; Express 4 needed a try/catch or a wrapper for that.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const httpError = toHttpError(err);

  // Unexpected errors are bugs: log the details for us, but send the client
  // only a generic message. Stack traces can reveal file paths and internals.
  if (httpError.status >= 500) {
    console.error(err);
  }

  const body: ApiError = {
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.fields ? { fields: httpError.fields } : {}),
    },
  };
  res.status(httpError.status).json(body);
};

/** Maps any thrown value to an HttpError, recognizing the ones Express's body parser throws. */
function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  // express.json() marks its errors with a `type` (from the body-parser library).
  const type = (err as { type?: unknown } | null)?.type;
  if (type === "entity.parse.failed") {
    return new HttpError(400, "VALIDATION_ERROR", "The request body isn't valid JSON.");
  }
  if (type === "entity.too.large") {
    return new HttpError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  }

  return new HttpError(
    500,
    "INTERNAL_ERROR",
    "Something went wrong on our side. Please try again.",
  );
}

/** Adds the 404 and error handlers. Must be called after every route is registered. */
export function installErrorHandling(app: Express): void {
  app.use(notFound);
  app.use(errorHandler);
}
