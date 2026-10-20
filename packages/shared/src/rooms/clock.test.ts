// Tests for clock-offset estimation. Each test simulates a real exchange:
// a client clock that's off by some amount, plus network delays each way.
import { describe, expect, it } from "vitest";
import { estimateClockOffset, serverNow, type ClockSample } from "./clock";

/**
 * Simulates one ping: the client's clock is `trueOffset` ms BEHIND the
 * server's; the request takes `up` ms and the reply takes `down` ms.
 */
function sample(serverSendTime: number, trueOffset: number, up: number, down: number): ClockSample {
  const t0 = serverSendTime - trueOffset; // client clock when sending
  return {
    t0,
    serverTime: serverSendTime + up, // server reads its clock on arrival
    t1: t0 + up + down, // client clock when the reply arrives
  };
}

describe("estimateClockOffset", () => {
  it("finds the offset exactly when both directions take the same time", () => {
    const estimate = estimateClockOffset([sample(1_000_000, 3_000, 40, 40)]);

    expect(estimate).toEqual({ offsetMs: 3_000, rttMs: 80 });
  });

  it("works when the client's clock is ahead (a negative offset)", () => {
    expect(estimateClockOffset([sample(1_000_000, -2_500, 30, 30)]).offsetMs).toBe(-2_500);
  });

  // The guarantee that makes this useful: lopsided delays can't fool it by
  // more than half the round trip.
  it("is off by at most half the round trip when delays are lopsided", () => {
    const trueOffset = 3_000;
    const estimate = estimateClockOffset([sample(1_000_000, trueOffset, 150, 10)]);

    expect(Math.abs(estimate.offsetMs - trueOffset)).toBeLessThanOrEqual(estimate.rttMs / 2);
  });

  it("trusts the sample with the shortest round trip", () => {
    const trueOffset = 3_000;
    const samples = [
      sample(1_000_000, trueOffset, 400, 20), // slow and lopsided: misleading
      sample(1_001_000, trueOffset, 12, 10), // fast: nearly exact
      sample(1_002_000, trueOffset, 90, 300),
    ];

    const estimate = estimateClockOffset(samples);

    expect(estimate.rttMs).toBe(22);
    expect(Math.abs(estimate.offsetMs - trueOffset)).toBeLessThanOrEqual(1);
  });

  it("ignores a sample where the client's clock jumped backwards", () => {
    const broken: ClockSample = { t0: 5_000, serverTime: 9_000, t1: 4_000 };

    expect(estimateClockOffset([broken, sample(1_000_000, 100, 20, 20)]).offsetMs).toBe(100);
  });

  it("throws when there's nothing to estimate from", () => {
    expect(() => estimateClockOffset([])).toThrow();
  });
});

describe("serverNow", () => {
  it("adds the offset to the local clock", () => {
    expect(serverNow(3_000, 1_000_000)).toBe(1_003_000);
  });
});
