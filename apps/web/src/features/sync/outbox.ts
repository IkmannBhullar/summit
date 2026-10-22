/**
 * The outbox: every session report a signed-in user's browser owes the
 * server, saved in localStorage and sent in order, so nothing is lost to a
 * bad connection, a closed tab, or a reload.
 *
 *   timer event ──► enqueue (saved at once) ──► drain: send the oldest
 *                                                  │
 *        done ◄── success          retry later ◄── │ ──► dropped (server said no)
 *
 * Why one ordered queue for starts AND finishes: if an old "finished" were
 * sent after a newer "started", the server would see two running sessions,
 * close the old one as abandoned, and its meters would be lost. In order,
 * that can't happen.
 *
 * Duplicates can't happen either: every session keeps the UUID the browser
 * gave it, and the server treats a repeat of the same id as the same request
 * (decision 018). So retrying after an unknown outcome is always safe.
 *
 * Plain TypeScript (no React), with the API calls and timers passed in, so
 * tests can drive it directly.
 */
import {
  FocusSessionSchema,
  StartSessionInputSchema,
  type FocusSession,
  type ImportResult,
  type StartSessionInput,
} from "@summit/shared";
import { z } from "zod";
import { ApiRequestError } from "../../lib/api";
import { loadListFromStorage, saveToStorage } from "../../lib/storage";

/** The longest wait between retries. */
export const MAX_RETRY_DELAY_MS = 60_000;

export const OutboxItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("start"), input: StartSessionInputSchema }),
  z.object({ kind: z.literal("finish"), session: FocusSessionSchema }),
]);
export type OutboxItem = z.infer<typeof OutboxItemSchema>;

/** The session endpoints the outbox calls. They throw ApiRequestError on failure. */
export interface OutboxApi {
  start: (input: StartSessionInput) => Promise<unknown>;
  complete: (id: string) => Promise<unknown>;
  abandon: (id: string) => Promise<unknown>;
  saveOffline: (sessions: FocusSession[]) => Promise<ImportResult>;
}

export interface OutboxState {
  /** Finished sessions not yet saved to the account. */
  waiting: number;
  /** Something the server refused for good (shown once, until the next success). */
  problem: string | null;
}

export interface OutboxDeps {
  /** Where it's saved, e.g. "outbox:<userId>": one per account, never shared. */
  storageKey: string;
  api: OutboxApi;
  /** Runs `run` after `delayMs`; returns a cancel function. Tests pass a fake. */
  schedule?: (delayMs: number, run: () => void) => () => void;
  /** Called after a finished session is saved (to refresh history, climb, stats). */
  onSessionSaved?: () => void;
}

type SendOutcome =
  { kind: "done" } | { kind: "retry"; delayMs: number } | { kind: "dropped"; message: string };

const defaultSchedule = (delayMs: number, run: () => void) => {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
};

export class SessionOutbox {
  private items: OutboxItem[];
  private readonly deps: OutboxDeps;
  private readonly schedule: NonNullable<OutboxDeps["schedule"]>;
  private readonly listeners = new Set<() => void>();
  private snapshot: OutboxState;
  private problem: string | null = null;
  private draining = false;
  private running = false;
  /** retryNow() came while a request was in flight: if it fails, try again at once. */
  private retryRequested = false;
  /** Failures in a row, for the growing retry delay. */
  private attempts = 0;
  private cancelRetry: (() => void) | null = null;

  constructor(deps: OutboxDeps) {
    this.deps = deps;
    this.schedule = deps.schedule ?? defaultSchedule;
    // Whatever was waiting when the page last closed.
    this.items = loadListFromStorage(deps.storageKey, OutboxItemSchema);
    this.snapshot = this.computeState();
  }

  // ----- For React (useSyncExternalStore) --------------------------------

  /** Arrow functions, so they still work when passed around on their own. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The same object until something changes (React compares by identity). */
  getState = (): OutboxState => this.snapshot;

  // ----- Lifecycle --------------------------------------------------------

  /** Starts sending (call on mount). Whatever was saved goes out first. */
  start(): void {
    this.running = true;
    void this.drain();
  }

  /** Stops sending and cancels any waiting retry (call on unmount). Items stay saved. */
  stop(): void {
    this.running = false;
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  /** Try now instead of waiting (e.g. the browser just came back online). */
  retryNow(): void {
    this.attempts = 0;
    if (this.draining) this.retryRequested = true;
    else void this.drain();
  }

  // ----- Adding work ------------------------------------------------------

  enqueueStart(input: StartSessionInput): void {
    this.add({ kind: "start", input });
  }

  enqueueFinish(session: FocusSession): void {
    // A start still in the queue hasn't been confirmed. Sending it now
    // would make the server start its clock NOW, and it would then refuse
    // the completion as too early. So drop it, even if it's being sent at
    // this moment: the finish goes next, and whether or not that start got
    // through, the server either completes the session or answers "not
    // found", which saves it through the offline route instead.
    this.items = this.items.filter(
      (item) => !(item.kind === "start" && item.input.id === session.id),
    );
    this.add({ kind: "finish", session });
  }

  // ----- Internals --------------------------------------------------------

  private add(item: OutboxItem): void {
    this.items.push(item);
    this.changed();
    void this.drain();
  }

  /** Sends items oldest first until the queue is empty or something must wait. */
  private async drain(): Promise<void> {
    if (this.draining || !this.running) return;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.draining = true;
    try {
      while (this.running && this.items.length > 0) {
        const item = this.items[0]!;
        const outcome = await this.send(item);

        if (outcome.kind === "retry") {
          // The connection came back while this request was failing: go again now.
          if (this.retryRequested) {
            this.retryRequested = false;
            continue;
          }
          this.cancelRetry = this.schedule(outcome.delayMs, () => void this.drain());
          break;
        }
        // Done or dropped: either way it leaves the queue (by identity: while
        // we waited, enqueueFinish may have removed it or added items).
        this.items = this.items.filter((other) => other !== item);
        this.attempts = 0;
        if (outcome.kind === "dropped") {
          this.problem = outcome.message;
        } else if (item.kind === "finish") {
          this.problem = null;
          this.deps.onSessionSaved?.();
        }
        this.changed();
      }
    } finally {
      this.draining = false;
      this.retryRequested = false;
    }
  }

  private async send(item: OutboxItem): Promise<SendOutcome> {
    const { api } = this.deps;
    try {
      if (item.kind === "start") {
        await api.start(item.input);
        return { kind: "done" };
      }
      const { session } = item;
      try {
        await (session.status === "COMPLETED" ? api.complete(session.id) : api.abandon(session.id));
        return { kind: "done" };
      } catch (error) {
        if (!(error instanceof ApiRequestError && error.status === 404)) throw error;
        // The server never saw this session start (we were offline): send the
        // whole finished session to be checked by the offline rules instead.
        const result = await api.saveOffline([session]);
        return result.imported === 1
          ? { kind: "done" }
          : {
              kind: "dropped",
              message: "A session you finished offline couldn't be added to your account.",
            };
      }
    } catch (error) {
      return this.retryOrDrop(error);
    }
  }

  /** Temporary problems wait and retry; a definite "no" drops the item. */
  private retryOrDrop(error: unknown): SendOutcome {
    if (error instanceof ApiRequestError) {
      // The server's clock says it isn't time yet: wait exactly as asked.
      if (error.code === "SESSION_TOO_EARLY") {
        return { kind: "retry", delayMs: (error.retryAfterSeconds ?? 1) * 1000 };
      }
      // Other 4xx (except 401: signed out, maybe briefly) won't change on retry.
      const permanent = error.status >= 400 && error.status < 500 && error.status !== 401;
      if (permanent) {
        return { kind: "dropped", message: `A session couldn't be saved: ${error.message}` };
      }
    }
    // Offline, a server error, or something unexpected: back off 1 s, 2 s, 4 s… up to 60 s.
    this.attempts += 1;
    return {
      kind: "retry",
      delayMs: Math.min(1000 * 2 ** (this.attempts - 1), MAX_RETRY_DELAY_MS),
    };
  }

  private computeState(): OutboxState {
    return {
      waiting: this.items.filter((item) => item.kind === "finish").length,
      problem: this.problem,
    };
  }

  /** Saves the queue and tells subscribers. */
  private changed(): void {
    saveToStorage(this.deps.storageKey, this.items);
    this.snapshot = this.computeState();
    for (const listener of this.listeners) listener();
  }
}
