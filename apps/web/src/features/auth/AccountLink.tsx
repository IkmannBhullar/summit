import { Link } from "react-router";
import { useCurrentUser } from "./useAuth";

/** The header's account control: "Sign in" for guests, an initial for signed-in users. */
export function AccountLink() {
  const { user, isLoading } = useCurrentUser();

  // While checking, show nothing rather than flashing "Sign in".
  if (isLoading) return <span className="size-11" aria-hidden="true" />;

  if (!user) {
    return (
      <Link
        to="/login"
        className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-teal-700 hover:bg-slate-200 dark:text-teal-400 dark:hover:bg-slate-800"
      >
        Sign in
      </Link>
    );
  }

  return (
    <Link
      to="/account"
      // The visible initial isn't a good name on its own.
      aria-label={`Account (${user.displayName})`}
      className="inline-flex size-11 items-center justify-center rounded-full bg-teal-700 font-semibold text-white hover:bg-teal-800"
    >
      {user.displayName.charAt(0).toUpperCase()}
    </Link>
  );
}
