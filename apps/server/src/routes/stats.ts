/**
 * GET /api/stats?tz=America/Vancouver (sign-in required) → 200 { stats }
 *
 * The browser sends its time zone (Intl.DateTimeFormat().resolvedOptions()
 * .timeZone), so days, streaks, and hours match the user's own calendar.
 */
import { StatsQuerySchema, type StatsResponse } from "@summit/shared";
import { Router, type RequestHandler } from "express";
import { validate } from "../lib/validate";
import { signedInUserId } from "../middleware/auth";
import type { StatsService } from "../services/stats";

export function createStatsRouter(deps: {
  stats: StatsService;
  requireAuth: RequestHandler;
}): Router {
  const router = Router();
  router.get("/", deps.requireAuth, async (req, res) => {
    const { tz } = validate(StatsQuerySchema, req.query);
    const body: StatsResponse = { stats: await deps.stats.forUser(signedInUserId(req), tz) };
    res.json(body);
  });
  return router;
}
