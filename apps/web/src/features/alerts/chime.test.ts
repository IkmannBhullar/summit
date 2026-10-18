// Tests for the chime, using a small fake AudioContext (jsdom has no Web Audio).
import { describe, expect, it, vi } from "vitest";
import { CHIME_NOTES, createChime } from "./chime";

/** A fake AudioContext that records the oscillators it creates. */
function fakeContext(initialState: AudioContextState = "running") {
  const oscillators: {
    type: string;
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
  }[] = [];
  const context = {
    state: initialState,
    currentTime: 10,
    destination: {},
    resume: vi.fn(() => {
      context.state = "running";
      return Promise.resolve();
    }),
    createOscillator: () => {
      const oscillator = {
        type: "",
        frequency: { value: 0 },
        connect: (node: unknown) => node,
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain: () => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: (node: unknown) => node,
    }),
  };
  // Cast once here: the fake only implements what the chime uses.
  return { context: context as unknown as AudioContext, raw: context, oscillators };
}

describe("createChime", () => {
  it("stays silent until unlocked by a user interaction", () => {
    const fake = fakeContext();
    const chime = createChime(() => fake.context);

    chime.play("focusEnd");

    expect(fake.oscillators).toHaveLength(0);
  });

  it("plays one sine note per frequency once unlocked", () => {
    const fake = fakeContext();
    const chime = createChime(() => fake.context);

    chime.unlock();
    chime.play("focusEnd");

    expect(fake.oscillators.map((osc) => osc.frequency.value)).toEqual([...CHIME_NOTES.focusEnd]);
    expect(fake.oscillators.every((osc) => osc.type === "sine")).toBe(true);
  });

  it("staggers the notes so they ring one after another", () => {
    const fake = fakeContext();
    const chime = createChime(() => fake.context);

    chime.unlock();
    chime.play("focusEnd");

    const startTimes = fake.oscillators.map((osc) => osc.start.mock.calls[0]?.[0] as number);
    expect(startTimes[1]).toBeGreaterThan(startTimes[0]!);
    expect(startTimes[2]).toBeGreaterThan(startTimes[1]!);
  });

  it("uses a different, shorter chime when a break ends", () => {
    const fake = fakeContext();
    const chime = createChime(() => fake.context);

    chime.unlock();
    chime.play("breakEnd");

    expect(fake.oscillators.map((osc) => osc.frequency.value)).toEqual([...CHIME_NOTES.breakEnd]);
  });

  it("resumes a suspended context when unlocking", async () => {
    const fake = fakeContext("suspended");
    const chime = createChime(() => fake.context);

    chime.unlock();
    await Promise.resolve(); // let resume() finish

    expect(fake.raw.resume).toHaveBeenCalled();
    chime.play("focusEnd");
    expect(fake.oscillators).toHaveLength(3);
  });

  it("creates only one audio context, however often it's unlocked", () => {
    const factory = vi.fn(() => fakeContext().context);
    const chime = createChime(factory);

    chime.unlock();
    chime.unlock();
    chime.unlock();

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("does nothing (and doesn't throw) where Web Audio isn't supported", () => {
    const chime = createChime(() => null);

    expect(() => {
      chime.unlock();
      chime.play("focusEnd");
    }).not.toThrow();
  });
});
