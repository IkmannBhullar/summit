/**
 * The parts of the mountain drawing that never change: sky, mountain, snow
 * cap, the dashed trail, and the summit flag. Shared by the solo mountain
 * and the rope team mountain; each adds its own climbers on top.
 *
 * These render inside an <svg> using the coordinates from trail.ts.
 */
import { MOUNTAIN_OUTLINE, SNOW_CAP, SUMMIT, toPathData, TRAIL_PATH, VIEW_BOX } from "./trail";

// Path data never changes, so build the strings once instead of every render.
const OUTLINE_PATH = toPathData(MOUNTAIN_OUTLINE, true);
const SNOW_PATH = toPathData(SNOW_CAP, true);

/** Sky, mountain, snow cap, and the whole trail (faint and dashed). */
export function MountainBackdrop() {
  return (
    <>
      <rect
        width={VIEW_BOX.width}
        height={VIEW_BOX.height}
        className="fill-sky-100 dark:fill-slate-900"
      />
      <path d={OUTLINE_PATH} className="fill-slate-400 dark:fill-slate-700" />
      <path d={SNOW_PATH} className="fill-white dark:fill-slate-200" />
      <path
        d={TRAIL_PATH}
        fill="none"
        strokeWidth={2}
        strokeDasharray="4 5"
        strokeLinecap="round"
        className="stroke-slate-100/80 dark:stroke-slate-400/60"
      />
    </>
  );
}

/** The flag on the summit. */
export function SummitFlag() {
  return (
    <>
      <line
        x1={SUMMIT.x}
        y1={SUMMIT.y}
        x2={SUMMIT.x}
        y2={SUMMIT.y - 20}
        strokeWidth={2}
        className="stroke-slate-700 dark:stroke-slate-300"
      />
      <path
        d={`M${SUMMIT.x} ${SUMMIT.y - 20} L${SUMMIT.x + 14} ${SUMMIT.y - 15} L${SUMMIT.x} ${SUMMIT.y - 10} Z`}
        className="fill-red-500"
      />
    </>
  );
}
