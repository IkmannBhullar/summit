// Tests for deciding when to celebrate a summit.
import { applyMeters, createInitialProgress, type ClimbProgress } from "@summit/shared";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSummitCelebration } from "./useSummitCelebration";

const NOW = new Date("2026-10-17T12:00:00.000Z");
const progressAt = (meters: number): ClimbProgress =>
  applyMeters(createInitialProgress(), meters, NOW).progress;

/** Renders the hook with progress that the test can change later. */
const setup = (initial: ClimbProgress) =>
  renderHook((props: { progress: ClimbProgress }) => useSummitCelebration(props.progress), {
    initialProps: { progress: initial },
  });

describe("useSummitCelebration", () => {
  it("has nothing to celebrate while climbing", () => {
    const { result, rerender } = setup(progressAt(0));

    rerender({ progress: progressAt(3000) });

    expect(result.current.summitedPeak).toBeNull();
  });

  it("celebrates a summit that happens while the app is open, with the next peak", () => {
    const { result, rerender } = setup(progressAt(3700));

    rerender({ progress: progressAt(3800) });

    expect(result.current.summitedPeak?.name).toBe("Mt. Fuji");
    expect(result.current.nextPeak?.name).toBe("Mt. Rainier");
  });

  it("stops celebrating once dismissed", () => {
    const { result, rerender } = setup(progressAt(3700));
    rerender({ progress: progressAt(3800) });

    act(() => result.current.dismiss());

    expect(result.current.summitedPeak).toBeNull();
  });

  // Opening the app shouldn't replay celebrations for old summits.
  it("doesn't re-celebrate summits that existed when the app opened", () => {
    const { result } = setup(progressAt(10_000)); // Fuji and Rainier already done

    expect(result.current.summitedPeak).toBeNull();
  });

  it("celebrates two summits in a row, one after the other", () => {
    const { result, rerender } = setup(progressAt(0));
    rerender({ progress: progressAt(8200) }); // passes Fuji (3,776) and Rainier (4,392)

    expect(result.current.summitedPeak?.name).toBe("Mt. Fuji");
    act(() => result.current.dismiss());
    expect(result.current.summitedPeak?.name).toBe("Mt. Rainier");
    act(() => result.current.dismiss());
    expect(result.current.summitedPeak).toBeNull();
  });

  it("has no next peak after the final summit", () => {
    const { result, rerender } = setup(progressAt(40_000));
    rerender({ progress: progressAt(100_000) });

    // Step through any remaining celebrations to the last one.
    while (result.current.nextPeak !== null) {
      act(() => result.current.dismiss());
    }
    expect(result.current.summitedPeak?.name).toBe("Mt. Everest");
  });
});
