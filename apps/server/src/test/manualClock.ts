/**
 * A fake clock and timer scheduler for tests. Time stands still until the
 * test calls `advance()`, so "wait 25 minutes" runs instantly and every
 * timestamp is exact.
 */
import type { Clock, Schedule } from "../services/roomManager";

interface PendingTimer {
  /** When it should run (ms since epoch). */
  at: number;
  run: () => void;
  /** Creation order, so two timers due at the same moment run in order. */
  id: number;
}

export class ManualClock implements Clock {
  private time: number;
  private timers: PendingTimer[] = [];
  private nextId = 0;

  constructor(start: string) {
    this.time = Date.parse(start);
  }

  /** The current fake time. (An arrow function, so it can be passed around on its own.) */
  now = (): number => this.time;

  /** Same contract as the real scheduler: run later, return a cancel function. */
  schedule: Schedule = (delayMs, run) => {
    const timer = { at: this.time + delayMs, run, id: this.nextId++ };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((pending) => pending !== timer);
    };
  };

  /**
   * Moves time forward by `ms`, running each timer that comes due, in order,
   * with the clock set to that timer's own due time (as if time really passed).
   * A timer scheduled by another timer runs too if it falls inside the window.
   */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const next = this.timers
        .filter((timer) => timer.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next) break;
      this.timers = this.timers.filter((timer) => timer !== next);
      this.time = next.at;
      next.run();
    }
    this.time = target;
  }

  /** How many timers are waiting (to check nothing is left running). */
  get pendingTimers(): number {
    return this.timers.length;
  }
}
