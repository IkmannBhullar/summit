// Tests for the session API schemas.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  ImportSessionsInputSchema,
  ListSessionsQuerySchema,
  MAX_IMPORT_SESSIONS,
  MAX_PAGE_SIZE,
  StartSessionInputSchema,
} from "./sessions";

const ID = "0b7c5d1e-8f4a-4c3b-9d2e-1a6f7b8c9d0e";

describe("StartSessionInputSchema", () => {
  it("accepts an id and planned length, defaulting tag to null", () => {
    expect(StartSessionInputSchema.parse({ id: ID, plannedMinutes: 25 })).toEqual({
      id: ID,
      plannedMinutes: 25,
      tag: null,
    });
  });

  // The client may only say what it plans; the server owns time and meters.
  it("ignores fields the client isn't allowed to set", () => {
    const parsed = StartSessionInputSchema.parse({
      id: ID,
      plannedMinutes: 25,
      startedAt: "2020-01-01T00:00:00.000Z",
      metersGained: 99_999,
      status: "COMPLETED",
    });

    expect(Object.keys(parsed).sort()).toEqual(["id", "plannedMinutes", "tag"]);
  });

  it.each([
    ["a non-UUID id", { id: "session-1", plannedMinutes: 25 }],
    ["0 minutes", { id: ID, plannedMinutes: 0 }],
    ["more than the maximum", { id: ID, plannedMinutes: 121 }],
    ["fractional minutes", { id: ID, plannedMinutes: 2.5 }],
  ])("rejects %s", (_label, input) => {
    expect(StartSessionInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("ListSessionsQuerySchema", () => {
  it("defaults the page size", () => {
    expect(ListSessionsQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  // Query strings arrive as text: ?limit=5 is "5", not 5.
  it("converts limit from text to a number", () => {
    expect(ListSessionsQuerySchema.parse({ limit: "5", cursor: "abc" })).toEqual({
      limit: 5,
      cursor: "abc",
    });
  });

  it.each(["0", String(MAX_PAGE_SIZE + 1), "ten"])("rejects limit=%s", (limit) => {
    expect(ListSessionsQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});

describe("ImportSessionsInputSchema", () => {
  const session = {
    id: ID,
    plannedMinutes: 25,
    startedAt: "2026-10-17T09:00:00.000Z",
    endedAt: "2026-10-17T09:25:00.000Z",
    status: "COMPLETED",
    tag: null,
    metersGained: 250,
    roomId: null,
  };

  it("accepts a list of valid sessions", () => {
    expect(ImportSessionsInputSchema.safeParse({ sessions: [session] }).success).toBe(true);
  });

  it("rejects an empty import", () => {
    expect(ImportSessionsInputSchema.safeParse({ sessions: [] }).success).toBe(false);
  });

  it(`rejects more than ${MAX_IMPORT_SESSIONS} sessions at once`, () => {
    const tooMany = Array.from({ length: MAX_IMPORT_SESSIONS + 1 }, () => session);

    expect(ImportSessionsInputSchema.safeParse({ sessions: tooMany }).success).toBe(false);
  });

  // The shared FocusSession rules still apply to imported data.
  it("rejects a session claiming more meters than it earned", () => {
    expect(
      ImportSessionsInputSchema.safeParse({ sessions: [{ ...session, metersGained: 9999 }] })
        .success,
    ).toBe(false);
  });
});
