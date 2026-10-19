// Tests for the API client, with MSW standing in for the server.
import { AuthResponseSchema } from "@summit/shared";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/server";
import { apiRequest, ApiRequestError } from "./api";

const user = {
  id: "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e",
  email: "ana@example.com",
  displayName: "Ana",
  createdAt: "2026-10-18T09:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

/** Runs a request that should fail and returns the error it threw. */
async function failure(promise: Promise<unknown>): Promise<ApiRequestError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiRequestError);
  return error as ApiRequestError;
}

describe("apiRequest", () => {
  it("sends JSON with cookies and returns the validated response", async () => {
    let seen: { contentType: string | null; body: unknown } | undefined;
    server.use(
      http.post("*/api/auth/login", async ({ request }) => {
        seen = { contentType: request.headers.get("content-type"), body: await request.json() };
        return HttpResponse.json({ user });
      }),
    );
    // MSW rebuilds requests in Node without `credentials`, so check what the
    // client handed to fetch() directly. The spy still calls the real fetch.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: "ana@example.com", password: "pw" },
      schema: AuthResponseSchema,
    });

    expect(result).toEqual({ user });
    expect(seen).toEqual({
      contentType: "application/json",
      body: { email: "ana@example.com", password: "pw" },
    });
    // "include" sends the login cookie along with the request.
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("turns an API error into an ApiRequestError with its code and fields", async () => {
    server.use(
      http.post("*/api/auth/register", () =>
        HttpResponse.json(
          {
            error: {
              code: "EMAIL_TAKEN",
              message: "An account with this email already exists.",
              fields: { email: "An account with this email already exists." },
            },
          },
          { status: 409 },
        ),
      ),
    );

    const error = await failure(apiRequest("/api/auth/register", { method: "POST", body: {} }));

    expect(error).toMatchObject({
      status: 409,
      code: "EMAIL_TAKEN",
      message: "An account with this email already exists.",
      fields: { email: "An account with this email already exists." },
    });
  });

  it("handles an error response that isn't in the standard shape", async () => {
    server.use(http.get("*/api/auth/me", () => new HttpResponse("Bad Gateway", { status: 502 })));

    const error = await failure(apiRequest("/api/auth/me"));

    expect(error).toMatchObject({ status: 502, code: "INTERNAL_ERROR" });
  });

  it("reports when the server can't be reached at all", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.error()));

    const error = await failure(apiRequest("/api/auth/me"));

    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  // A server bug or a mismatched deploy fails here, not deep in the UI.
  it("rejects a successful response that doesn't match the schema", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ user: { id: "not-a-user" } })));

    const error = await failure(apiRequest("/api/auth/me", { schema: AuthResponseSchema }));

    expect(error.code).toBe("BAD_RESPONSE");
  });

  it("accepts an empty 204 response when no schema is given", async () => {
    server.use(http.post("*/api/auth/logout", () => new HttpResponse(null, { status: 204 })));

    await expect(apiRequest("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});
