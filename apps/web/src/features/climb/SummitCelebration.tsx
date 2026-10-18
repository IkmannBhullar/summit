import type { Peak } from "@summit/shared";
import { m } from "motion/react";
import { useId } from "react";
import { Modal } from "../../components/Modal";

export interface SummitCelebrationProps {
  /** The peak just summited; the dialog is open while this is set. */
  peak: Peak | null;
  /** The newly unlocked peak, or null if that was the last one. */
  nextPeak: Peak | null;
  onClose: () => void;
}

/** The "you made it!" moment after reaching a summit. */
export function SummitCelebration({ peak, nextPeak, onClose }: SummitCelebrationProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Modal
      open={peak !== null}
      onDismiss={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
    >
      {peak && (
        <div className="flex flex-col items-center gap-3 text-center">
          {/* The flag pops in with a little bounce. MotionConfig in App turns
              this off for people who prefer reduced motion. */}
          <m.svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            className="size-16"
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 12 }}
          >
            <line
              x1="14"
              y1="6"
              x2="14"
              y2="44"
              strokeWidth="3"
              className="stroke-slate-700 dark:stroke-slate-200"
            />
            <path d="M14 6 L40 14 L14 22 Z" className="fill-red-500" />
          </m.svg>

          <h2 id={titleId} className="text-2xl font-bold">
            You summited {peak.name}!
          </h2>
          <div id={descriptionId} className="text-slate-600 dark:text-slate-400">
            <p>
              {peak.heightMeters.toLocaleString("en-US")} m · {peak.region}
            </p>
            <p className="mt-2 font-medium text-slate-900 dark:text-slate-100">
              {nextPeak
                ? `Next up: ${nextPeak.name} (${nextPeak.heightMeters.toLocaleString("en-US")} m)`
                : "That was the last peak. You've climbed them all!"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-xl bg-teal-700 px-6 py-2.5 font-semibold text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            Keep climbing
          </button>
        </div>
      )}
    </Modal>
  );
}
