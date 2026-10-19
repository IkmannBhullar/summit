import { useCurrentUser, useLogout } from "./useAuth";

/** /account (signed-in only, see RequireAuth): profile details and sign out. */
export function AccountPage() {
  const { user } = useCurrentUser();
  // After signing out, RequireAuth sends us home: no navigation needed here.
  const logout = useLogout();

  // RequireAuth guarantees a user; this only keeps TypeScript satisfied.
  if (!user) return null;

  const memberSince = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
    new Date(user.createdAt),
  );

  return (
    <section className="w-full max-w-sm">
      <h2 className="text-2xl font-bold">Your account</h2>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
        <dt className="text-slate-500 dark:text-slate-400">Name</dt>
        <dd className="font-medium">{user.displayName}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Email</dt>
        <dd className="font-medium break-all">{user.email}</dd>
        <dt className="text-slate-500 dark:text-slate-400">Member since</dt>
        <dd className="font-medium">{memberSince}</dd>
      </dl>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="mt-8 rounded-xl px-6 py-3 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
      >
        {logout.isPending ? "Signing out…" : "Sign out"}
      </button>
    </section>
  );
}
