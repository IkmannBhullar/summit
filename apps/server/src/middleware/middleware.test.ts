// Tests for request parsing and error handling, using a small app with
// test-only routes but the SAME install functions the real app uses.
import { RegisterInputSchema } from "@summit/shared";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../lib/httpError";
import { validate } from "../lib/validate";
import { apiError } from "../test/http";
import { installErrorHandling } from "./errors";
import { installRequestParsing } from "./parsing";

/** An app with routes that exercise each kind of success and failure. */
function buildTestApp() {
  const app = express();
  installRequestParsing(app);

  app.post("/echo", (req, res) => {
    res.json({ body: req.body as unknown });
  });
  app.post("/no-body", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/cookies", (req, res) => {
    res.json({ cookies: req.cookies as unknown });
  });
  app.post("/register", (req, res) => {
    res.json({ input: validate(RegisterInputSchema, req.body) });
  });
  app.get("/teapot", () => {
    throw new HttpError(409, "CONFLICT", "That session already ended.");
  });
  app.get("/bug", () => {
    throw new Error("secret internal detail: db password is hunter2");
  });
  // Express 5 catches rejected promises from async handlers automatically.
  app.get("/async-bug", async () => {
    await Promise.resolve();
    throw new Error("async failure");
  });

  installErrorHandling(app);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JSON bodies", () => {
  it("parses a JSON body", async () => {
    const res = await request(buildTestApp()).post("/echo").send({ hello: "summit" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ body: { hello: "summit" } });
  });

  // Rejecting non-JSON bodies blocks forged cross-site <form> submissions.
  it("rejects a form-encoded body with 415", async () => {
    const res = await request(buildTestApp())
      .post("/echo")
      .type("form")
      .send("email=ana@example.com");

    expect(res.status).toBe(415);
    expect(apiError(res).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects a plain-text body with 415", async () => {
    const res = await request(buildTestApp()).post("/echo").type("text").send("hello");

    expect(res.status).toBe(415);
  });

  it("allows a request with no body at all", async () => {
    const res = await request(buildTestApp()).post("/no-body");

    expect(res.status).toBe(200);
  });

  it("answers broken JSON with a 400 instead of crashing", async () => {
    const res = await request(buildTestApp())
      .post("/echo")
      .set("Content-Type", "application/json")
      .send('{"hello": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "The request body isn't valid JSON." },
    });
  });

  it("rejects bodies over 1 MB with 413", async () => {
    const res = await request(buildTestApp())
      .post("/echo")
      .send({ padding: "x".repeat(1_100_000) });

    expect(res.status).toBe(413);
    expect(apiError(res).code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("cookies", () => {
  it("parses the Cookie header into req.cookies", async () => {
    const res = await request(buildTestApp()).get("/cookies").set("Cookie", "summit_session=abc");

    expect(res.body).toEqual({ cookies: { summit_session: "abc" } });
  });
});

describe("validation", () => {
  it("returns the parsed value when the input is valid", async () => {
    const res = await request(buildTestApp())
      .post("/register")
      .send({ email: " Ana@Example.com", password: "correct horse", displayName: "Ana" });

    expect(res.status).toBe(200);
    expect((res.body as { input: { email: string } }).input.email).toBe("ana@example.com");
  });

  it("returns 400 with a message for each bad field", async () => {
    const res = await request(buildTestApp())
      .post("/register")
      .send({ email: "nope", password: "short", displayName: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Some fields need fixing.",
        fields: {
          email: "Enter a valid email address.",
          password: "Use at least 8 characters.",
          displayName: "Enter a display name.",
        },
      },
    });
  });
});

describe("errors", () => {
  it("turns an HttpError into its status and standard JSON shape", async () => {
    const res = await request(buildTestApp()).get("/teapot");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: "CONFLICT", message: "That session already ended." },
    });
  });

  // Internal details (stack traces, messages) must never reach the client.
  it("hides the details of unexpected errors, but logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(buildTestApp()).get("/bug");

    expect(res.status).toBe(500);
    expect(apiError(res).code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(log).toHaveBeenCalled();
  });

  it("also catches errors thrown in async route handlers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(buildTestApp()).get("/async-bug");

    expect(res.status).toBe(500);
    expect(apiError(res).code).toBe("INTERNAL_ERROR");
  });

  it("answers unknown routes with a JSON 404", async () => {
    const res = await request(buildTestApp()).delete("/nowhere");

    expect(res.status).toBe(404);
    expect(apiError(res)).toEqual({ code: "NOT_FOUND", message: "No route for DELETE /nowhere" });
  });
});
