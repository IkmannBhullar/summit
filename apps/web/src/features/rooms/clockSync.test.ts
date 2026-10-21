// Tests for collecting clock-sync samples.
import type { ClockPong } from "@summit/shared";
import { describe, expect, it } from "vitest";
import { measureClockOffset } from "./clockSync";

/** A fake device clock that reads the given times, in order. */
const clockReading = (...times: number[]) => {
  let i = 0;
  return () => times[i++] ?? Number.NaN;
};

describe("measureClockOffset", () => {
  it("trusts the sample with the fastest round trip", async () => {
    // Server is exactly 1,000 ms ahead. Round trips: 400 ms, 20 ms, 200 ms.
    // The slow ones' replies were delayed one way, which skews them.
    const serverTimes = [1_000 + 1_000 + 350, 2_000 + 1_000 + 10, 3_000 + 1_000 + 50];
    const ping = (clientTime: number): Promise<ClockPong> =>
      Promise.resolve({ clientTime, serverTime: serverTimes.shift() ?? 0 });

    const estimate = await measureClockOffset(ping, {
      samples: 3,
      now: clockReading(1_000, 1_400, 2_000, 2_020, 3_000, 3_200),
    });

    expect(estimate).toEqual({ offsetMs: 1_000, rttMs: 20 });
  });

  it("sends the pings one at a time, never overlapping", async () => {
    let inFlight = 0;
    let mostAtOnce = 0;
    const ping = async (clientTime: number): Promise<ClockPong> => {
      inFlight++;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      await Promise.resolve();
      inFlight--;
      return { clientTime, serverTime: clientTime };
    };

    await measureClockOffset(ping);

    expect(mostAtOnce).toBe(1);
  });

  it("fails if a ping gets no answer", async () => {
    const ping = () => Promise.reject(new Error("timeout"));

    await expect(measureClockOffset(ping)).rejects.toThrow("timeout");
  });
});
