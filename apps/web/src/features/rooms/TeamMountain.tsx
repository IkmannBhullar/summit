import type { RoomMember } from "@summit/shared";
import { m } from "motion/react";
import { useId } from "react";
import { MountainBackdrop, SummitFlag } from "../climb/MountainScenery";
import { toPathData, VIEW_BOX } from "../climb/trail";
import { climberColor, describeTeam, placeClimbers, ropePoints } from "./climberPlacement";

/** How long a climber takes to walk to a new spot, in seconds (same as solo). */
const CLIMB_ANIMATION_SECONDS = 1.2;

export interface TeamMountainProps {
  members: readonly RoomMember[];
  /** True while a team session runs: the rope is drawn taut and solid. */
  roped: boolean;
}

/**
 * Everyone in the rope team on one mountain, each at their progress on
 * their own current peak, joined by a rope.
 */
export function TeamMountain({ members, roped }: TeamMountainProps) {
  const titleId = useId();
  const placed = placeClimbers(members);
  const rope = ropePoints(placed);

  return (
    <figure className="flex w-full max-w-md flex-col gap-2">
      <svg
        viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        role="img"
        aria-labelledby={titleId}
        // Like the solo mountain: capped height on short phone screens.
        className="max-h-[25dvh] w-full overflow-hidden rounded-2xl sm:max-h-none"
      >
        <title id={titleId}>{describeTeam(members)}</title>
        <MountainBackdrop />
        <SummitFlag />

        {rope.length > 1 && (
          <path
            data-testid="rope"
            d={toPathData(rope)}
            fill="none"
            strokeWidth={roped ? 2.5 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            // Slack and faint between sessions; solid while everyone is roped in.
            strokeDasharray={roped ? undefined : "3 4"}
            className={
              roped
                ? "stroke-amber-700 dark:stroke-amber-400"
                : "stroke-amber-700/60 dark:stroke-amber-300/70"
            }
          />
        )}

        {placed.map((climber) => {
          const member = members[climber.index]!;
          return (
            // The group moves with a transform, so Motion can animate it
            // (and skip the animation for people who prefer reduced motion).
            // initial={false}: appear in place, don't walk in from 0,0.
            <m.g
              key={climber.userId}
              initial={false}
              animate={{ x: climber.point.x, y: climber.point.y }}
              transition={{ duration: CLIMB_ANIMATION_SECONDS, ease: "easeInOut" }}
              aria-hidden="true"
            >
              <circle
                r={9}
                strokeWidth={2}
                className={`${climberColor(climber.index).fill} stroke-white dark:stroke-slate-900`}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-white text-[10px] font-bold select-none"
              >
                {member.displayName.charAt(0).toUpperCase()}
              </text>
            </m.g>
          );
        })}
      </svg>
      <figcaption className="text-center text-sm text-slate-500 dark:text-slate-400">
        Each climber stands at their progress on their own current peak.
      </figcaption>
    </figure>
  );
}
