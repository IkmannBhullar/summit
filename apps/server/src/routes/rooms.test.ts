// Integration tests for the room routes.
import { RoomResponseSchema } from "@summit/shared";
import request, { type Response } from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDependencies } from "../app";
import { testConfig } from "../test/config";
import { createTestPrisma, resetDatabase } from "../test/db";
import { apiError } from "../test/http";

const prisma = createTestPrisma();

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const buildApp = (overrides: Partial<AppDependencies> = {}) =>
  createApp({
    config: testConfig,
    prisma,
    authRateLimit: { windowMs: 60_000, limit: 1000 },
    ...overrides,
  });

async function signIn(app: ReturnType<typeof buildApp>, email = "ana@example.com") {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .send({ email, password: "correct horse battery", displayName: "Climber" });
  return agent;
}

const roomIn = (res: Response) => RoomResponseSchema.parse(res.body).room;

describe("POST /api/rooms", () => {
  it("creates a room hosted by the signed-in user (201)", async () => {
    const app = buildApp();
    const agent = await signIn(app);

    const res = await agent.post("/api/rooms");

    expect(res.status).toBe(201);
    const { code } = roomIn(res);
    const stored = await prisma.room.findFirstOrThrow({ where: { code }, include: { host: true } });
    expect(stored.host.email).toBe("ana@example.com");
  });

  it("requires sign-in (401)", async () => {
    const res = await request(buildApp()).post("/api/rooms");

    expect(res.status).toBe(401);
  });

  // Per USER, so friends sharing one home network each get their own allowance.
  it("limits how many rooms one user creates, per user (429)", async () => {
    const app = buildApp({ roomCreateLimit: { windowMs: 60_000, limit: 2 } });
    const ana = await signIn(app, "ana@example.com");
    const ben = await signIn(app, "ben@example.com");

    expect((await ana.post("/api/rooms")).status).toBe(201);
    expect((await ana.post("/api/rooms")).status).toBe(201);
    const blocked = await ana.post("/api/rooms");

    expect(blocked.status).toBe(429);
    expect(apiError(blocked).code).toBe("RATE_LIMITED");
    expect((await ben.post("/api/rooms")).status).toBe(201);
  });
});

describe("GET /api/rooms/:code", () => {
  it("finds an open room, whatever case or dashes the code is typed with", async () => {
    const app = buildApp();
    const agent = await signIn(app);
    const { code } = roomIn(await agent.post("/api/rooms"));
    const typed = `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase();

    const res = await agent.get(`/api/rooms/${typed}`);

    expect(res.status).toBe(200);
    expect(roomIn(res).code).toBe(code);
  });

  it("returns 404 for a closed room", async () => {
    const app = buildApp();
    const agent = await signIn(app);
    const { code } = roomIn(await agent.post("/api/rooms"));
    await prisma.room.updateMany({ data: { closedAt: new Date() } });

    const res = await agent.get(`/api/rooms/${code}`);

    expect(res.status).toBe(404);
    expect(apiError(res).message).toBe("There's no open room with that code.");
  });

  it("returns 400 for a code that can't be valid", async () => {
    const agent = await signIn(buildApp());

    const res = await agent.get("/api/rooms/nope");

    expect(res.status).toBe(400);
    expect(apiError(res).fields).toEqual({ code: "Room codes are 6 letters and numbers." });
  });

  it("requires sign-in (401)", async () => {
    expect((await request(buildApp()).get("/api/rooms/K7QM2X")).status).toBe(401);
  });
});
