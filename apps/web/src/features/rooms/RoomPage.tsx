import { RoomCodeSchema } from "@summit/shared";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { SecondaryButton } from "../../components/Buttons";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useNow } from "../../lib/useNow";
import { useShell } from "../../shell";
import { useCurrentUser } from "../auth/useAuth";
import { roomClock } from "./roomClock";
import { RoomMembers } from "./RoomMembers";
import { formatRoomCode, roomInviteLink } from "./roomsApi";
import { describeOutcome } from "./teamAlerts";
import { TeamMountain } from "./TeamMountain";
import { TeamTimer } from "./TeamTimer";
import { useRoom } from "./useRoom";
import { useTeamAlerts } from "./useTeamAlerts";

/** How often the clocks re-render. Each render recomputes the time from endsAt. */
const TICK_MS = 250;

/**
 * /rooms/:code (signed-in only). The URL is the invite: opening it joins.
 * A code typed loosely ("k7q-m2x") is tidied into the canonical URL first.
 */
export function RoomPage() {
  const { code = "" } = useParams();
  const parsed = RoomCodeSchema.safeParse(code);

  if (!parsed.success) return <RoomProblem message="That isn't a room code." />;
  if (parsed.data !== code) return <Navigate to={`/rooms/${parsed.data}`} replace />;
  // `key`: another room gets a fresh connection and state.
  return <RoomView key={parsed.data} code={parsed.data} />;
}

function RoomView({ code }: { code: string }) {
  const { status, room, problem, offsetMs, startSession, giveUp, leave } = useRoom(code);
  const { user } = useCurrentUser();
  const { settings, preferences } = useShell();
  const navigate = useNavigate();
  // The device clock plus the measured offset = the server's clock.
  const serverNow = useNow(TICK_MS).getTime() + offsetMs;
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string>();
  useTeamAlerts(room, preferences.soundEnabled);

  if (status === "failed") {
    return <RoomProblem message={problem?.message ?? "Couldn't join this rope team."} />;
  }
  if (!room) {
    return (
      <main className="flex flex-1 justify-center pt-16">
        <p role="status" className="text-slate-500">
          Joining the rope team…
        </p>
      </main>
    );
  }

  const me = room.members.find((member) => member.userId === user?.id);
  const host = room.members.find((member) => member.isHost);
  const clock = roomClock(room.phase, serverNow);
  // During the countdown and focus, a participant's status is "focusing".
  const inSession = room.phase.kind === "focus" && me?.status === "focusing";

  const doLeave = async () => {
    setConfirmingLeave(false);
    const result = await leave();
    if (result.ok) void navigate("/rooms");
    else setLeaveError(result.error.message);
  };
  // Leaving mid-session slips everyone, so ask first.
  const requestLeave = () => (inSession ? setConfirmingLeave(true) : void doLeave());

  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 justify-items-center gap-8 px-6 pt-2 pb-[max(4rem,env(safe-area-inset-bottom))] lg:grid-cols-2 lg:items-start lg:gap-x-16 lg:pt-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <header className="flex w-full flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Rope team</h2>
            <p className="font-mono text-lg tracking-widest text-slate-600 dark:text-slate-400">
              <span className="sr-only">Room code </span>
              {formatRoomCode(room.code)}
            </p>
          </div>
          <InviteButton code={room.code} />
        </header>

        {status === "reconnecting" && (
          <p
            role="status"
            className="w-full rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            Reconnecting… Your place on the rope is held for a few seconds.
          </p>
        )}

        {/* How the last session ended, until the next one starts. role="status"
            makes screen readers announce it when it appears. */}
        {room.lastOutcome && (
          <p
            role="status"
            className={`w-full rounded-lg px-4 py-3 text-center font-medium ${
              room.lastOutcome.kind === "completed"
                ? "bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-200"
                : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            {describeOutcome(room.lastOutcome)}
          </p>
        )}

        <TeamMountain members={room.members} roped={room.phase.kind === "focus"} />

        <TeamTimer
          clock={clock}
          isHost={me?.isHost ?? false}
          hostName={host?.displayName ?? "the host"}
          inSession={inSession}
          defaultMinutes={settings.focusMinutes}
          onStart={startSession}
          onGiveUp={giveUp}
        />

        <SecondaryButton onClick={requestLeave}>Leave rope team</SecondaryButton>
        {leaveError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {leaveError}
          </p>
        )}
      </div>

      <RoomMembers members={room.members} myUserId={user?.id} serverNow={serverNow} />

      <ConfirmDialog
        open={confirmingLeave}
        title="Leave mid-session?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={() => void doLeave()}
        onCancel={() => setConfirmingLeave(false)}
      >
        A session is running. Leaving now slips the whole rope team: nobody gets its meters.
      </ConfirmDialog>
    </main>
  );
}

/** Copies the invite link, or shows it to copy by hand if the clipboard isn't available. */
function InviteButton({ code }: { code: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const link = roomInviteLink(code);

  const copyLink = () => {
    // The clipboard API only exists on secure pages (https or localhost).
    if (!("clipboard" in navigator)) {
      setCopy("failed");
      return;
    }
    navigator.clipboard.writeText(link).then(
      () => setCopy("copied"),
      () => setCopy("failed"),
    );
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={copyLink}
        className="min-h-11 rounded-lg px-3 font-medium text-teal-700 ring-1 ring-teal-700/30 hover:bg-teal-50 dark:text-teal-400 dark:ring-teal-400/30 dark:hover:bg-teal-950"
      >
        {copy === "copied" ? "Link copied!" : "Copy invite link"}
      </button>
      {copy === "failed" && (
        <p className="max-w-56 text-right text-sm break-all text-slate-600 dark:text-slate-400">
          Copy this link: <span className="select-all">{link}</span>
        </p>
      )}
    </div>
  );
}

/** Why we can't show a room, with a way back. */
function RoomProblem({ message }: { message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center gap-4 px-6 pt-16 text-center">
      <p role="alert" className="text-lg">
        {message}
      </p>
      <Link to="/rooms" className="font-medium text-teal-700 underline dark:text-teal-400">
        Back to rope teams
      </Link>
    </main>
  );
}
