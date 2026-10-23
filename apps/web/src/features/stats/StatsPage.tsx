import type { Stats } from "@summit/shared";
import { Link } from "react-router";
import { SecondaryButton } from "../../components/Buttons";
import { useCurrentUser } from "../auth/useAuth";
import { FocusHeatmap } from "./Heatmap";
import { HourChart } from "./HourChart";
import { formatMinutes } from "./statsFormat";
import { TagBreakdown } from "./TagBreakdown";
import { useStats } from "./useStats";
import { usePageTitle } from "../../lib/usePageTitle";

/**
 * /stats: streaks, totals, a year heatmap, time of day, and time per tag.
 * Accounts only (the numbers come from the server); guests get a way in.
 */
export function StatsPage() {
  usePageTitle("Your stats");
  const { user, isLoading } = useCurrentUser();
  const stats = useStats(Boolean(user));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pt-2 pb-[max(4rem,env(safe-area-inset-bottom))] lg:pt-8">
      <h2 className="text-2xl font-bold">Your stats</h2>
      {isLoading ? (
        <p role="status" className="text-slate-500">
          Loading…
        </p>
      ) : !user ? (
        <GuestPrompt />
      ) : stats.isPending ? (
        <p role="status" className="text-slate-500">
          Loading your stats…
        </p>
      ) : stats.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p>Couldn&apos;t load your stats. {stats.error.message}</p>
          <SecondaryButton onClick={() => void stats.refetch()}>Try again</SecondaryButton>
        </div>
      ) : (
        <StatsContent stats={stats.data} />
      )}
    </main>
  );
}

function GuestPrompt() {
  return (
    <div className="flex max-w-md flex-col gap-3">
      <p className="text-slate-600 dark:text-slate-300">
        Stats are worked out from the sessions saved to your account: your streaks, a year of focus,
        and where your time goes.
      </p>
      <p>
        {/* `from` brings them back here after signing in (see LoginPage). */}
        <Link
          to="/login"
          state={{ from: "/stats" }}
          className="font-medium text-teal-700 underline dark:text-teal-400"
        >
          Sign in to see your stats
        </Link>{" "}
        or{" "}
        <Link to="/register" className="font-medium text-teal-700 underline dark:text-teal-400">
          create an account
        </Link>
        .
      </p>
    </div>
  );
}

function StatsContent({ stats }: { stats: Stats }) {
  const { totals, streak } = stats;
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Current streak" value={days(streak.current)} />
        <StatCard label="Longest streak" value={days(streak.longest)} />
        <StatCard label="Total focus" value={formatMinutes(totals.focusMinutes)} />
        <StatCard
          label="Sessions"
          value={String(totals.completedSessions)}
          detail={totals.abandonedSessions > 0 ? `${totals.abandonedSessions} given up` : undefined}
        />
      </dl>

      {totals.completedSessions === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">
          Finish your first focus session and your stats will start filling in here.
        </p>
      ) : (
        <>
          <FocusHeatmap days={stats.days} today={stats.today} />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <HourChart byHour={stats.byHour} />
            <TagBreakdown byTag={stats.byTag} />
          </div>
        </>
      )}
    </>
  );
}

/** One number with its label. <dt>/<dd> pair them for screen readers. */
function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-xl font-bold tabular-nums sm:text-2xl">{value}</dd>
      {detail && <dd className="text-xs text-slate-500 dark:text-slate-400">{detail}</dd>}
    </div>
  );
}
