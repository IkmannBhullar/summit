import { findPeak, type RoomMember } from "@summit/shared";

const STATUS_LABELS: Record<RoomMember["status"], string> = {
  idle: "Ready",
  focusing: "Focusing",
  on_break: "On break",
  disconnected: "Reconnecting",
};

const STATUS_STYLES: Record<RoomMember["status"], string> = {
  idle: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  focusing: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
  on_break: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  disconnected: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

export interface RoomMembersProps {
  members: readonly RoomMember[];
  /** To mark "(you)". */
  myUserId: string | undefined;
  /** The server's current time, for "Reconnecting… 12s". */
  serverNow: number;
}

/** Everyone in the rope team: name, host badge, what they're doing, and their climb. */
export function RoomMembers({ members, myUserId, serverNow }: RoomMembersProps) {
  return (
    <section aria-labelledby="climbers-heading" className="w-full max-w-md">
      <h3 id="climbers-heading" className="text-lg font-semibold">
        Climbers ({members.length})
      </h3>
      <ul className="mt-3 flex flex-col gap-2">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
          >
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-700 font-semibold text-white dark:bg-teal-600"
            >
              {member.displayName.charAt(0).toUpperCase()}
            </span>
            {/* min-w-0 lets long names truncate instead of pushing the badge off screen. */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {member.displayName}
                {member.userId === myUserId && (
                  <span className="font-normal text-slate-500"> (you)</span>
                )}
                {member.isHost && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                    Host
                  </span>
                )}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {findPeak(member.climb.peakId)?.name ?? member.climb.peakId} ·{" "}
                {member.climb.metersGained.toLocaleString()} m
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[member.status]}`}
            >
              {statusText(member, serverNow)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Focusing", or for someone mid-reconnect, how long they have left: "Reconnecting… 12s". */
function statusText(member: RoomMember, serverNow: number): string {
  if (member.status !== "disconnected" || !member.reconnectBy) return STATUS_LABELS[member.status];
  const seconds = Math.max(0, Math.ceil((Date.parse(member.reconnectBy) - serverNow) / 1000));
  return `Reconnecting… ${seconds}s`;
}
