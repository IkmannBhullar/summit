/**
 * Estimating how far this device's clock is from the server's.
 *
 * Teammates' devices disagree about the time, often by seconds. The server
 * says "the session ends at 10:25:00.000" (its clock), so each client needs
 * its offset from the server to show the same countdown as everyone else.
 *
 * One measurement ("sample"):
 *
 *   client sends at t0 ──────► server reads its clock: serverTime
 *   client receives at t1 ◄───┘
 *
 * The round trip took (t1 − t0). Assuming the reply was sent halfway
 * through, the client's clock read (t0 + t1) / 2 at the moment the server
 * read `serverTime`, so:
 *
 *   offset = serverTime − (t0 + t1) / 2
 *
 * If the two directions took different times, the estimate is off by at most
 * half the round trip. So with several samples, trust the one with the
 * shortest round trip: it has the smallest possible error.
 * (This is the core idea behind NTP, the protocol that syncs computer clocks.)
 */

export interface ClockSample {
  /** Client clock when the ping was sent. */
  t0: number;
  /** Server clock when it answered. */
  serverTime: number;
  /** Client clock when the answer arrived. */
  t1: number;
}

export interface ClockEstimate {
  /** Add this to the client's clock to get the server's: serverNow = Date.now() + offsetMs. */
  offsetMs: number;
  /** Round-trip time of the sample used; the offset is accurate to within half of this. */
  rttMs: number;
}

/**
 * The best offset estimate from a set of samples (the one with the shortest
 * round trip).
 *
 * @throws Error if there are no usable samples.
 */
export function estimateClockOffset(samples: readonly ClockSample[]): ClockEstimate {
  // A negative round trip means the client's clock jumped mid-sample: ignore it.
  const usable = samples.filter((sample) => sample.t1 >= sample.t0);
  const best = usable.reduce<ClockSample | undefined>(
    (fastest, sample) =>
      !fastest || sample.t1 - sample.t0 < fastest.t1 - fastest.t0 ? sample : fastest,
    undefined,
  );
  if (!best) throw new Error("estimateClockOffset needs at least one usable sample");

  return {
    offsetMs: Math.round(best.serverTime - (best.t0 + best.t1) / 2),
    rttMs: best.t1 - best.t0,
  };
}

/** The server's current time, as best this device can tell. */
export function serverNow(offsetMs: number, localNow: number = Date.now()): number {
  return localNow + offsetMs;
}
