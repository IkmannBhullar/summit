/**
 * A soft bell chime, synthesized with the Web Audio API.
 *
 * Generating the sound in code means no audio files to download, cache, or
 * license. Each note is a sine-wave oscillator whose volume rises quickly
 * and fades out slowly, which the ear hears as a bell.
 *
 * Browsers block audio until the user has interacted with the page (the
 * "autoplay policy"). So `unlock()` runs on the user's clicks and key
 * presses, and `play()` stays silent until then instead of throwing.
 */

/** Note frequencies in Hz: an upward C–E–G when focus ends, a gentle G–E when a break ends. */
export const CHIME_NOTES = {
  focusEnd: [523.25, 659.25, 783.99],
  breakEnd: [783.99, 659.25],
} as const;

export type ChimeKind = keyof typeof CHIME_NOTES;

/** Seconds between the start of each note. */
const NOTE_SPACING = 0.18;
/** How long each note rings before fading to silence, in seconds. */
const NOTE_LENGTH = 0.9;
/** Peak volume (0 to 1). Kept low: it should be noticeable, not startling. */
const PEAK_VOLUME = 0.25;

export interface Chime {
  /** Call during a user interaction so later sounds are allowed. Safe to call often. */
  unlock: () => void;
  /** Plays a chime if audio is unlocked; otherwise does nothing. Never throws. */
  play: (kind: ChimeKind) => void;
}

/**
 * Creates a chime player.
 *
 * @param createContext - Makes the AudioContext. Injectable so tests can pass
 *   a fake (jsdom has no Web Audio). Returns null where audio isn't supported.
 */
export function createChime(
  createContext: () => AudioContext | null = defaultCreateContext,
): Chime {
  // Created lazily, on the first unlock: a context created during a user
  // interaction starts out allowed to play.
  let context: AudioContext | null = null;

  return {
    unlock() {
      context ??= createContext();
      // A context can be "suspended" (created too early, or paused by the OS).
      if (context?.state === "suspended") {
        context.resume().catch(() => {});
      }
    },

    play(kind) {
      if (context?.state !== "running") return; // not unlocked yet: stay silent
      const startAt = context.currentTime + 0.05;

      CHIME_NOTES[kind].forEach((frequency, index) => {
        const noteStart = startAt + index * NOTE_SPACING;
        const oscillator = context!.createOscillator();
        const volume = context!.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;

        // Volume envelope: near-silent → quick rise → slow fade. Exponential
        // ramps sound natural, but can't start from exactly 0, hence 0.0001.
        volume.gain.setValueAtTime(0.0001, noteStart);
        volume.gain.exponentialRampToValueAtTime(PEAK_VOLUME, noteStart + 0.02);
        volume.gain.exponentialRampToValueAtTime(0.0001, noteStart + NOTE_LENGTH);

        // oscillator → volume → speakers
        oscillator.connect(volume).connect(context!.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + NOTE_LENGTH + 0.05);
      });
    },
  };
}

/** Makes a real AudioContext, or null if this browser has no Web Audio. */
function defaultCreateContext(): AudioContext | null {
  return typeof AudioContext === "undefined" ? null : new AudioContext();
}

/** The app's single chime player. */
export const chime = createChime();
