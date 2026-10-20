/**
 * Room routes, mounted at /api/rooms (both require sign-in):
 *
 *   POST /api/rooms         create a room you host   → 201 { room: { code, createdAt } }
 *   GET  /api/rooms/:code   is this an open room?    → 200 { room }, or 404
 *
 * Joining and everything live happen over the socket, not here.
 */
import { RoomCodeSchema, type RoomResponse } from "@summit/shared";
import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { HttpError } from "../lib/httpError";
import { validate } from "../lib/validate";
import { signedInUserId } from "../middleware/auth";
import { toRoomInfo, type RoomService } from "../services/rooms";
import type { RateLimitSettings } from "./auth";

/** 20 new rooms per user per hour: plenty for real use, a brake on spamming codes. */
export const DEFAULT_ROOM_CREATE_LIMIT: RateLimitSettings = {
  windowMs: 60 * 60 * 1000,
  limit: 20,
};

const CodeParams = z.object({ code: RoomCodeSchema });

export function createRoomsRouter(deps: {
  rooms: RoomService;
  requireAuth: RequestHandler;
  rateLimit: RateLimitSettings;
}): Router {
  const { rooms, requireAuth } = deps;
  const router = Router();
  router.use(requireAuth);

  // Limit per USER (not per IP like login): everyone here is signed in, and
  // several friends behind one home router shouldn't share one allowance.
  const createLimiter = rateLimit({
    windowMs: deps.rateLimit.windowMs,
    limit: deps.rateLimit.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => signedInUserId(req),
    handler: (_req, _res, next) => {
      next(new HttpError(429, "RATE_LIMITED", "You've created a lot of rooms. Try again later."));
    },
  });

  router.post("/", createLimiter, async (req, res) => {
    const room = await rooms.create(signedInUserId(req));
    const body: RoomResponse = { room: toRoomInfo(room) };
    res.status(201).json(body);
  });

  router.get("/:code", async (req, res) => {
    // Normalizes "k7q-m2x" to "K7QM2X"; a malformed code is a clear 400.
    const { code } = validate(CodeParams, req.params);
    const room = await rooms.findOpenByCode(code);
    if (!room) {
      throw new HttpError(404, "NOT_FOUND", "There's no open room with that code.");
    }
    const body: RoomResponse = { room: toRoomInfo(room) };
    res.json(body);
  });

  return router;
}
