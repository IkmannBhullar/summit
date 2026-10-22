// Tests for the session outbox: a fake API decides every reply, and a fake
// scheduler records retries instead of really waiting.
import type { FocusSession, ImportResult } from "@summit/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../lib/api";
import { makeSession } from "../../test/fixtures";
import { MAX_RETRY_DELAY_MS, SessionOutbox, type OutboxApi } from "./outbox";

const KEY = "outbox:ana";
const offline = () => new ApiRequestError(0, "NETWORK_ERROR", "Can't reach Summit.");
const notFound = () => new ApiRequestError(404, "NOT_FOUND", "Session not found.");

/** Lets pending promises (the outbox's awaits) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * An outbox with a fake API and scheduler. `reply` decides each call's
 * answer; `calls` records them, e.g. "complete <id>".
 */
function setup(reply: (call: string) => Promise<unknown> = () => Promise.resolve({})) {
  const calls: string[] = [];
  const timers: { delayMs: number; run: () => void; cancelled: boolean }[] = [];
  const onSessionSaved = vi.fn();
  const fake = { reply };
  const api: OutboxApi = {
    start: (input) => record(`start ${input.id}`),
    complete: (id) => record(`complete ${id}`),
    abandon: (id) => record(`abandon ${id}`),
    saveOffline: (sessions) =>
      record(`offline ${sessions.map((s) => s.id).join(",")}`) as Promise<ImportResult>,
  };
  function record(call: string) {
    calls.push(call);
    return fake.reply(call);
  }
  const make = () =>
    new SessionOutbox({
      storageKey: KEY,
      api,
      onSessionSaved,
      schedule: (delayMs, run) => {
        const timer = { delayMs, run, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    });
  const outbox = make();
  outbox.start();
  return {
    outbox,
    calls,
    timers,
    onSessionSaved,
    fake,
    /** A fresh outbox on the same storage: what a reload would create. */
    reload: make,
    /** Runs the latest scheduled retry. */
    fireRetry: async () => {
      timers
        .filter((t) => !t.cancelled)
        .at(-1)
        ?.run();
      await settle();
    },
  };
}

const startOf = (session: FocusSession) => ({
  id: session.id,
  plannedMinutes: session.plannedMinutes,
  tag: session.tag,
});

describe("SessionOutbox", () => {
  it("sends a start and then its finish, in order, and reports the save", async () => {
    const t = setup();
    const session = makeSession("2026-10-21T09:25:00.000Z");

    t.outbox.enqueueStart(startOf(session));
    await settle();
    t.outbox.enqueueFinish(session);
    await settle();

    expect(t.calls).toEqual([`start ${session.id}`, `complete ${session.id}`]);
    expect(t.outbox.getState()).toEqual({ waiting: 0, problem: null });
    expect(t.onSessionSaved).toHaveBeenCalledOnce();
  });

  it("reports giving up with abandon", async () => {
    const t = setup();
    const session = makeSession("2026-10-21T09:25:00.000Z", { status: "ABANDONED" });

    t.outbox.enqueueFinish(session);
    await settle();

    expect(t.calls).toEqual([`abandon ${session.id}`]);
  });

  it("keeps a session waiting while offline, retrying 1 s, 2 s, 4 s… later", async () => {
    const t = setup(() => Promise.reject(offline()));
    const session = makeSession("2026-10-21T09:25:00.000Z");

    t.outbox.enqueueFinish(session);
    await settle();
    await t.fireRetry();
    await t.fireRetry();

    expect(t.timers.map((timer) => timer.delayMs)).toEqual([1000, 2000, 4000]);
    expect(t.outbox.getState().waiting).toBe(1);
  });

  it("never waits longer than a minute between tries", async () => {
    const t = setup(() => Promise.reject(offline()));
    t.outbox.enqueueFinish(makeSession("2026-10-21T09:25:00.000Z"));
    await settle();

    for (let i = 0; i < 10; i++) await t.fireRetry();

    expect(t.timers.at(-1)?.delayMs).toBe(MAX_RETRY_DELAY_MS);
  });

  it("tries again at once when the browser comes back online", async () => {
    const t = setup(() => Promise.reject(offline()));
    const session = makeSession("2026-10-21T09:25:00.000Z");
    t.outbox.enqueueFinish(session);
    await settle();

    t.fake.reply = () => Promise.resolve({});
    t.outbox.retryNow();
    await settle();

    expect(t.outbox.getState().waiting).toBe(0);
    expect(t.timers.at(-1)?.cancelled).toBe(true);
  });

  it("tries again at once if the connection returns while a request is failing", async () => {
    let failInFlight: (() => void) | undefined;
    const t = setup(
      () =>
        new Promise((_, reject) => {
          failInFlight = () => reject(offline());
        }),
    );
    t.outbox.enqueueFinish(makeSession("2026-10-21T09:25:00.000Z"));
    await settle();

    t.outbox.retryNow(); // "online" fires mid-request
    t.fake.reply = () => Promise.resolve({});
    failInFlight?.();
    await settle();

    expect(t.calls).toHaveLength(2);
    expect(t.timers).toEqual([]); // no backoff wait
    expect(t.outbox.getState().waiting).toBe(0);
  });

  // Saved at once, so closing the tab or reloading loses nothing.
  it("survives a reload: a new outbox sends what the old one couldn't", async () => {
    const t = setup(() => Promise.reject(offline()));
    const session = makeSession("2026-10-21T09:25:00.000Z");
    t.outbox.enqueueFinish(session);
    await settle();
    t.outbox.stop();

    t.fake.reply = () => Promise.resolve({});
    const afterReload = t.reload();
    expect(afterReload.getState().waiting).toBe(1);
    afterReload.start();
    await settle();

    expect(afterReload.getState().waiting).toBe(0);
    expect(t.calls.at(-1)).toBe(`complete ${session.id}`);
  });

  it("waits as long as the server asks when a completion is too early", async () => {
    const t = setup((call) =>
      call.startsWith("complete")
        ? Promise.reject(new ApiRequestError(409, "SESSION_TOO_EARLY", "Not yet.", {}, 42))
        : Promise.resolve({}),
    );

    t.outbox.enqueueFinish(makeSession("2026-10-21T09:25:00.000Z"));
    await settle();

    expect(t.timers.at(-1)?.delayMs).toBe(42_000);
    expect(t.outbox.getState().waiting).toBe(1);
  });

  // Offline from the start: the server never heard of this session.
  it("saves a finished session through the offline route when the server never saw it start", async () => {
    const t = setup((call) =>
      call.startsWith("complete")
        ? Promise.reject(notFound())
        : Promise.resolve({ imported: 1, skipped: 0 }),
    );
    const session = makeSession("2026-10-21T09:25:00.000Z");

    t.outbox.enqueueFinish(session);
    await settle();

    expect(t.calls).toEqual([`complete ${session.id}`, `offline ${session.id}`]);
    expect(t.outbox.getState()).toEqual({ waiting: 0, problem: null });
    expect(t.onSessionSaved).toHaveBeenCalledOnce();
  });

  // Sending the start late would start the server's clock late, and the
  // completion would then be refused as "too early".
  it("drops a start that never got out once its session has finished", async () => {
    const t = setup(() => Promise.reject(offline()));
    const session = makeSession("2026-10-21T09:25:00.000Z");
    t.outbox.enqueueStart(startOf(session));
    await settle(); // the start fails: we're offline

    t.outbox.enqueueFinish(session);
    t.fake.reply = (call) =>
      call.startsWith("complete")
        ? Promise.reject(notFound())
        : Promise.resolve({ imported: 1, skipped: 0 });
    t.outbox.retryNow();
    await settle();

    expect(t.calls.filter((call) => call.startsWith("start"))).toHaveLength(1); // only the failed try
    expect(t.calls.slice(-2)).toEqual([`complete ${session.id}`, `offline ${session.id}`]);
  });

  // The session ended while its start was still being sent, and that send
  // failed. Retrying the start now would be "late" (see above), so it isn't.
  it("never resends a start that failed after its session ended", async () => {
    let failStart: (() => void) | undefined;
    const t = setup((call) =>
      call.startsWith("start")
        ? new Promise((_, reject) => {
            failStart = () => reject(offline());
          })
        : call.startsWith("complete")
          ? Promise.reject(notFound())
          : Promise.resolve({ imported: 1, skipped: 0 }),
    );
    const session = makeSession("2026-10-21T09:25:00.000Z");
    t.outbox.enqueueStart(startOf(session));
    await settle();

    t.outbox.enqueueFinish(session); // while the start is in flight
    failStart?.();
    await settle();
    await t.fireRetry();

    expect(t.calls).toEqual([
      `start ${session.id}`,
      `complete ${session.id}`,
      `offline ${session.id}`,
    ]);
  });

  it("drops what the server refuses for good, says so, and carries on", async () => {
    const refused = makeSession("2026-10-21T09:25:00.000Z");
    const next = makeSession("2026-10-21T10:25:00.000Z");
    const t = setup((call) =>
      call === `complete ${refused.id}`
        ? Promise.reject(new ApiRequestError(409, "CONFLICT", "This session was abandoned."))
        : Promise.resolve({}),
    );

    t.outbox.enqueueFinish(refused);
    t.outbox.enqueueFinish(next);
    await settle();

    expect(t.calls).toEqual([`complete ${refused.id}`, `complete ${next.id}`]);
    expect(t.outbox.getState().waiting).toBe(0);
    // The later success clears the message.
    expect(t.outbox.getState().problem).toBeNull();
  });

  // Signed out for a moment (an expired cookie, another tab): don't throw the session away.
  it("keeps a session waiting through a 401 instead of dropping it", async () => {
    const t = setup(() =>
      Promise.reject(new ApiRequestError(401, "UNAUTHENTICATED", "Please sign in.")),
    );

    t.outbox.enqueueFinish(makeSession("2026-10-21T09:25:00.000Z"));
    await settle();

    expect(t.outbox.getState()).toEqual({ waiting: 1, problem: null });
    expect(t.timers).toHaveLength(1);
  });

  it("says so when an offline session doesn't pass the server's checks", async () => {
    const t = setup((call) =>
      call.startsWith("complete")
        ? Promise.reject(notFound())
        : Promise.resolve({ imported: 0, skipped: 1 }),
    );

    t.outbox.enqueueFinish(makeSession("2026-10-21T09:25:00.000Z"));
    await settle();

    expect(t.outbox.getState()).toEqual({
      waiting: 0,
      problem: "A session you finished offline couldn't be added to your account.",
    });
    expect(t.onSessionSaved).not.toHaveBeenCalled();
  });

  it("sends nothing after stop, and cancels its waiting retry", async () => {
    const t = setup(() => Promise.reject(offline()));
    t.outbox.enqueueFinish(makeSession("2026-10-21T09:25:00.000Z"));
    await settle();
    const callsBefore = t.calls.length;

    t.outbox.stop();
    t.outbox.retryNow();
    await settle();

    expect(t.timers.at(-1)?.cancelled).toBe(true);
    expect(t.calls).toHaveLength(callsBefore);
  });

  it("drops a corrupted saved item but keeps the rest", () => {
    const good = makeSession("2026-10-21T09:25:00.000Z");
    localStorage.setItem(
      `summit:${KEY}`,
      JSON.stringify([
        { kind: "finish", session: { id: "nope" } },
        { kind: "finish", session: good },
      ]),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const t = setup(() => new Promise(() => {})); // never answers, so nothing leaves

    expect(t.outbox.getState().waiting).toBe(1);
  });
});
