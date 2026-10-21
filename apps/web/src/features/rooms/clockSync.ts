/**
 * Measuring this device's clock offset from the server's.
 *
 * The math lives in packages/shared (estimateClockOffset, with the full
 * explanation). This part just collects the samples.
 */
import { estimateClockOffset, type ClockEstimate, type ClockPong } from "@summit/shared";

/** How many round trips to measure. More samples make a fast one more likely. */
export const CLOCK_SAMPLES = 5;

/**
 * Pings the server `samples` times and returns the best estimate.
 *
 * The pings go one after another, not all at once: sent together, later
 * ones would wait in line behind earlier ones, and every round trip would
 * look slow.
 *
 * @param now - The device clock; tests pass a fake one.
 * @throws if a ping gets no answer.
 */
export async function measureClockOffset(
  ping: (clientTime: number) => Promise<ClockPong>,
  { samples = CLOCK_SAMPLES, now = () => Date.now() } = {},
): Promise<ClockEstimate> {
  const measured = [];
  for (let i = 0; i < samples; i++) {
    const t0 = now();
    const { serverTime } = await ping(t0);
    measured.push({ t0, serverTime, t1: now() });
  }
  return estimateClockOffset(measured);
}
