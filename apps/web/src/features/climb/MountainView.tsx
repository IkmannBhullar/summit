import { getCurrentClimb, PEAKS, type ClimbProgress, type Peak } from "@summit/shared";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useId } from "react";
import { MountainBackdrop, SummitFlag } from "./MountainScenery";
import { pointAlong, TRAIL, TRAIL_PATH, VIEW_BOX } from "./trail";

/** Formats meters with thousands separators, e.g. "3,776 m". */
const meters = (value: number) => `${value.toLocaleString("en-US")} m`;

/** How long the climber takes to walk to a new position, in seconds. */
const CLIMB_ANIMATION_SECONDS = 1.2;

/** The current peak drawn as a mountain, with the climber partway up the trail. */
export function MountainView({ progress }: { progress: ClimbProgress }) {
  const current = getCurrentClimb(progress);

  // Every peak summited: show the climber on top of the last one.
  const peak: Peak = current?.peak ?? PEAKS[PEAKS.length - 1]!;
  const metersGained = current?.climb.metersGained ?? peak.heightMeters;
  const metersToSummit = current?.metersToSummit ?? 0;

  return (
    <figure className="flex w-full max-w-md flex-col gap-2 sm:gap-3">
      {/* key: a new peak remounts the drawing, so the climber starts at the
          new trailhead instead of animating backwards down the old mountain. */}
      <MountainDrawing
        key={peak.id}
        peakName={peak.name}
        fraction={metersGained / peak.heightMeters}
        metersGained={metersGained}
        heightMeters={peak.heightMeters}
      />
      <figcaption className="text-center">
        <h2 className="text-xl font-semibold">{current ? peak.name : "Every peak summited!"}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Peak {peak.order} of {PEAKS.length} · {peak.region}
        </p>
        {/* Each phrase stays on one line; only the gap between them can wrap.
            Slightly smaller on the narrowest phones (under 380 px), so the
            whole line fits and the Start button stays on screen. */}
        <p className="mt-1 text-sm text-slate-600 min-[380px]:text-base dark:text-slate-300">
          <span className="whitespace-nowrap">
            {meters(metersGained)} of {meters(peak.heightMeters)}
          </span>
          {current && (
            <>
              {" · "}
              <span className="whitespace-nowrap">{meters(metersToSummit)} to summit</span>
            </>
          )}
        </p>
      </figcaption>
    </figure>
  );
}

interface MountainDrawingProps {
  peakName: string;
  /** How far up the trail the climber is: 0 (trailhead) to 1 (summit). */
  fraction: number;
  metersGained: number;
  heightMeters: number;
}

/** The SVG itself. The climber's position is animated with Motion. */
function MountainDrawing({ peakName, fraction, metersGained, heightMeters }: MountainDrawingProps) {
  const titleId = useId();
  const prefersReducedMotion = useReducedMotion();

  // A "motion value" holds a number that changes over time WITHOUT
  // re-rendering React on every frame; Motion updates the SVG directly.
  // It starts at the current position, so the first render doesn't animate.
  const progress = useMotionValue(fraction);

  // When the climber earns elevation, walk smoothly to the new spot (or jump
  // there instantly for people who asked their OS to reduce motion).
  useEffect(() => {
    if (prefersReducedMotion) {
      progress.set(fraction);
      return;
    }
    const controls = animate(progress, fraction, {
      duration: CLIMB_ANIMATION_SECONDS,
      ease: "easeInOut",
    });
    // Cleanup: stop a running animation if the target changes again mid-way.
    return () => controls.stop();
  }, [fraction, prefersReducedMotion, progress]);

  // Derived motion values: recomputed from `progress` on each animation frame.
  const climberX = useTransform(progress, (f) => pointAlong(TRAIL, f).x);
  const climberY = useTransform(progress, (f) => pointAlong(TRAIL, f).y);
  // The climbed part of the trail: with pathLength=1, an offset of (1 - f)
  // reveals exactly the first f of the path.
  const climbedOffset = useTransform(progress, (f) => 1 - f);

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      // role="img" + <title>: screen readers announce one clear sentence
      // instead of trying to describe every shape.
      role="img"
      aria-labelledby={titleId}
      // Round the corners on the <svg> itself; overflow-hidden clips the
      // mountain's bottom corners to match. On short phone screens, cap the
      // height so the timer and Start button still fit without scrolling
      // (the drawing scales down, keeping its shape).
      className="max-h-[25dvh] w-full overflow-hidden rounded-2xl sm:max-h-none"
    >
      <title id={titleId}>
        {`Climber at ${meters(metersGained)} of ${meters(heightMeters)} on ${peakName}`}
      </title>

      {/* Sky, mountain, snow, and the whole trail, faint and dashed... */}
      <MountainBackdrop />
      {/* ...and the part already climbed, solid on top of it. */}
      <m.path
        d={TRAIL_PATH}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1 1"
        style={{ strokeDashoffset: climbedOffset }}
        className="stroke-teal-600 dark:stroke-teal-400"
      />

      <SummitFlag />

      {/* The climber */}
      <m.circle
        cx={climberX}
        cy={climberY}
        r={6}
        strokeWidth={2.5}
        className="fill-teal-600 stroke-white dark:fill-teal-400 dark:stroke-slate-900"
      />
    </svg>
  );
}
