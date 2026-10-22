/**
 * Session routes (all require sign-in):
 *
 *   POST /api/sessions                start (client-chosen UUID)  → 201, or 200 on retry
 *   POST /api/sessions/:id/complete   finish                      → 200 (409 if too early)
 *   POST /api/sessions/:id/abandon    give up                     → 200
 *   GET  /api/sessions?limit&cursor   history page, newest first  → 200
 *   POST /api/sessions/import         copy guest history in       → 200 { imported, skipped }
 *   POST /api/sessions/offline        sessions finished offline   → 200 { imported, skipped }
 *   GET  /api/climb                   climb progress              → 200
 *   GET  /api/tags/recent             recently used tags          → 200 { tags }
 *
 * Routes stay thin: validate input, call the service, shape the response.
 */
import {
  ImportSessionsInputSchema,
  OfflineSessionsInputSchema,
  ListSessionsQuerySchema,
  StartSessionInputSchema,
  type ClimbResponse,
  type RecentTagsResponse,
  type ImportResult,
  type SessionPage,
  type SessionResponse,
} from "@summit/shared";
import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { validate } from "../lib/validate";
import { signedInUserId } from "../middleware/auth";
import type { SessionService } from "../services/sessions";

/**
 * The :id in the URL must be a UUID. Checking it here returns a clear 400
 * (Postgres would otherwise reject it with an error we'd report as a 500).
 */
const SessionIdParams = z.object({ id: z.uuid({ message: "Invalid session id." }) });
const sessionIdFrom = (req: Request) => validate(SessionIdParams, req.params).id;

export function createSessionsRouter(deps: {
  sessions: SessionService;
  requireAuth: RequestHandler;
}): Router {
  const { sessions, requireAuth } = deps;
  const router = Router();
  router.use(requireAuth);

  router.post("/", async (req, res) => {
    const input = validate(StartSessionInputSchema, req.body);
    const { session, created } = await sessions.start(signedInUserId(req), input);
    const body: SessionResponse = { session };
    // 201 Created for a new session; 200 when a retry returns the existing one.
    res.status(created ? 201 : 200).json(body);
  });

  router.post("/:id/complete", async (req, res) => {
    const session = await sessions.complete(signedInUserId(req), sessionIdFrom(req));
    const body: SessionResponse = { session };
    res.json(body);
  });

  router.post("/:id/abandon", async (req, res) => {
    const session = await sessions.abandon(signedInUserId(req), sessionIdFrom(req));
    const body: SessionResponse = { session };
    res.json(body);
  });

  // The browser's outbox, for sessions the server never saw start.
  router.post("/offline", async (req, res) => {
    const { sessions: candidates } = validate(OfflineSessionsInputSchema, req.body);
    const body: ImportResult = await sessions.saveOfflineSessions(signedInUserId(req), candidates);
    res.json(body);
  });

  router.post("/import", async (req, res) => {
    const { sessions: candidates } = validate(ImportSessionsInputSchema, req.body);
    const body: ImportResult = await sessions.importGuestHistory(signedInUserId(req), candidates);
    res.json(body);
  });

  router.get("/", async (req, res) => {
    const query = validate(ListSessionsQuerySchema, req.query);
    const body: SessionPage = await sessions.history(signedInUserId(req), query);
    res.json(body);
  });

  return router;
}

export function createClimbRouter(deps: {
  sessions: SessionService;
  requireAuth: RequestHandler;
}): Router {
  const router = Router();
  router.get("/", deps.requireAuth, async (req, res) => {
    const body: ClimbResponse = { progress: await deps.sessions.climb(signedInUserId(req)) };
    res.json(body);
  });
  return router;
}

/** GET /api/tags/recent: the tags the picker offers, most recently used first. */
export function createTagsRouter(deps: {
  sessions: SessionService;
  requireAuth: RequestHandler;
}): Router {
  const router = Router();
  router.get("/recent", deps.requireAuth, async (req, res) => {
    const body: RecentTagsResponse = { tags: await deps.sessions.recentTags(signedInUserId(req)) };
    res.json(body);
  });
  return router;
}
