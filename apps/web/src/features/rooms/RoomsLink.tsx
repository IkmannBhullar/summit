import { Link } from "react-router";
import { useCurrentUser } from "../auth/useAuth";

/** The header's rope team link. Rooms need an account, so guests don't see it. */
export function RoomsLink() {
  const { user } = useCurrentUser();
  if (!user) return null;

  return (
    <Link
      to="/rooms"
      // Icon-only link: the label is what screen readers announce.
      aria-label="Rope teams"
      className="rounded-lg p-2.5 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <RopeTeamIcon />
    </Link>
  );
}

/** Two climbers joined by a rope (decorative, so hidden from screen readers). */
function RopeTeamIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M3 20v-4a3 3 0 0 1 6 0v4M15 20v-4a3 3 0 0 1 6 0v4" />
      <path d="M9 14c1.5-1.5 4.5-1.5 6 0" strokeDasharray="1.5 2" />
    </svg>
  );
}
