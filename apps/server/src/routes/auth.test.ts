// Integration tests for the auth routes, against the real test database.
import { AuthResponseSchema, type RegisterInput } from "@summit/shared";
import request, { type Response } from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppDependencies } from "../app";
import { createTokenService } from "../services/tokens";
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

/** An app with a rate limit high enough not to interfere, unless a test says otherwise. */
const buildApp = (overrides: Partial<AppDependencies> = {}) =>
  createApp({
    config: testConfig,
    prisma,
    authRateLimit: { windowMs: 60_000, limit: 1000 },
    ...overrides,
  });

const ana: RegisterInput = {
  email: "ana@example.com",
  password: "correct horse battery",
  displayName: "Ana",
};

/** The raw Set-Cookie header for the login cookie, if the response set one. */
function sessionCookie(res: Response): string | undefined {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  return header?.find((cookie) => cookie.startsWith("summit_session="));
}

/** The user in an auth response, checked against the shared contract. */
const userIn = (res: Response) => AuthResponseSchema.parse(res.body).user;

describe("POST /api/auth/register", () => {
  it("creates the account, signs in, and returns the user (201)", async () => {
    const res = await request(buildApp()).post("/api/auth/register").send(ana);

    expect(res.status).toBe(201);
    expect(userIn(res)).toMatchObject({ email: "ana@example.com", displayName: "Ana" });
    expect(sessionCookie(res)).toBeDefined();
  });

  it("sets the login cookie as HttpOnly, SameSite=Lax, for 7 days", async () => {
    const res = await request(buildApp()).post("/api/auth/register").send(ana);
    const cookie = sessionCookie(res)!;

    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=604800/);
    expect(cookie).not.toMatch(/; Secure/); // plain http in development and tests
  });

  it("marks the cookie Secure in production", async () => {
    const app = buildApp({ config: { ...testConfig, isProduction: true, nodeEnv: "production" } });

    const res = await request(app).post("/api/auth/register").send(ana);

    expect(sessionCookie(res)).toMatch(/; Secure/);
  });

  it("never returns or stores the plain password", async () => {
    const res = await request(buildApp()).post("/api/auth/register").send(ana);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: ana.email } });

    expect(JSON.stringify(res.body)).not.toContain(ana.password);
    expect(res.body).not.toHaveProperty("user.passwordHash");
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/); // a bcrypt hash
    expect(stored.passwordHash).not.toContain(ana.password);
  });

  it("stores the email trimmed and lowercased", async () => {
    await request(buildApp())
      .post("/api/auth/register")
      .send({ ...ana, email: "  Ana@Example.COM " });

    await expect(prisma.user.count({ where: { email: "ana@example.com" } })).resolves.toBe(1);
  });

  it("refuses a second account for the same email, in any capitalization (409)", async () => {
    const app = buildApp();
    await request(app).post("/api/auth/register").send(ana);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...ana, email: "ANA@example.com" });

    expect(res.status).toBe(409);
    expect(apiError(res)).toMatchObject({
      code: "EMAIL_TAKEN",
      fields: { email: "An account with this email already exists." },
    });
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("returns field errors for invalid input (400)", async () => {
    const res = await request(buildApp())
      .post("/api/auth/register")
      .send({ email: "nope", password: "short", displayName: "" });

    expect(res.status).toBe(400);
    expect(apiError(res).fields).toEqual({
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
      displayName: "Enter a display name.",
    });
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it("requires a JSON body (415)", async () => {
    const res = await request(buildApp())
      .post("/api/auth/register")
      .type("form")
      .send("email=ana@example.com");

    expect(res.status).toBe(415);
  });
});

describe("POST /api/auth/login", () => {
  /** Registers Ana, then returns a fresh app (no cookies carried over). */
  async function withAna() {
    const app = buildApp();
    await request(app).post("/api/auth/register").send(ana);
    return app;
  }

  it("signs in with the right password (200)", async () => {
    const app = await withAna();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ana.email, password: ana.password });

    expect(res.status).toBe(200);
    expect(userIn(res).email).toBe(ana.email);
    expect(sessionCookie(res)).toBeDefined();
  });

  it("accepts the email in any capitalization", async () => {
    const app = await withAna();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: " ANA@Example.com", password: ana.password });

    expect(res.status).toBe(200);
  });

  // The same response for both, so login can't be used to discover who has an account.
  it("gives the same 401 for a wrong password and for an unknown email", async () => {
    const app = await withAna();

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: ana.email, password: "wrong password" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong password" });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(apiError(res)).toEqual({
        code: "INVALID_CREDENTIALS",
        message: "Wrong email or password.",
      });
      expect(sessionCookie(res)).toBeUndefined();
    }
  });

  it("validates the input (400)", async () => {
    const res = await request(buildApp()).post("/api/auth/login").send({ email: "nope" });

    expect(res.status).toBe(400);
    expect(Object.keys(apiError(res).fields ?? {}).sort()).toEqual(["email", "password"]);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the signed-in user (an agent keeps cookies between requests, like a browser)", async () => {
    const agent = request.agent(buildApp());
    await agent.post("/api/auth/register").send(ana);

    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(userIn(res).email).toBe(ana.email);
  });

  it("returns 401 when not signed in", async () => {
    const res = await request(buildApp()).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(apiError(res).code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 for a forged token", async () => {
    const app = buildApp();
    const register = await request(app).post("/api/auth/register").send(ana);
    const forged = await createTokenService("a-different-secret-also-32-characters!").sign(
      userIn(register).id,
    );

    const res = await request(app).get("/api/auth/me").set("Cookie", `summit_session=${forged}`);

    expect(res.status).toBe(401);
  });

  it("returns 401 for a valid token whose account was deleted", async () => {
    const agent = request.agent(buildApp());
    await agent.post("/api/auth/register").send(ana);
    await prisma.user.deleteMany();

    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the cookie, after which the user is signed out", async () => {
    const agent = request.agent(buildApp());
    await agent.post("/api/auth/register").send(ana);

    const res = await agent.post("/api/auth/logout");

    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/summit_session=;.*Expires=Thu, 01 Jan 1970/);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("succeeds even when not signed in", async () => {
    const res = await request(buildApp()).post("/api/auth/logout");

    expect(res.status).toBe(204);
  });
});

describe("rate limiting", () => {
  it("blocks the 4th login attempt within the window when the limit is 3 (429)", async () => {
    const app = buildApp({ authRateLimit: { windowMs: 60_000, limit: 3 } });
    const attempt = () =>
      request(app).post("/api/auth/login").send({ email: ana.email, password: "guess" });

    for (let i = 0; i < 3; i++) {
      expect((await attempt()).status).toBe(401);
    }
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(apiError(blocked)).toEqual({
      code: "RATE_LIMITED",
      message: "Too many attempts. Please wait a few minutes.",
    });
    // Standard headers tell clients the policy and when to retry.
    expect(blocked.headers["ratelimit-policy"]).toBeDefined();
  });

  it("doesn't limit routes other than login and register", async () => {
    const app = buildApp({ authRateLimit: { windowMs: 60_000, limit: 1 } });

    for (let i = 0; i < 5; i++) {
      expect((await request(app).get("/api/auth/me")).status).toBe(401);
    }
  });
});
