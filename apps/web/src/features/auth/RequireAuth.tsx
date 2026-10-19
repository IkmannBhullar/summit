import { useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useCurrentUser } from "./useAuth";

/**
 * Guards a page that needs a signed-in user.
 *
 * - A guest who opens the page is sent to /login, remembering where they
 *   were going so login can bring them back.
 * - A user who signs out (or whose login expires) while on the page is
 *   sent home instead: they're done here, not trying to get in.
 *
 * Deciding this from what the guard itself has seen means signing out
 * needs no navigation of its own, so there's no race between "go home" and
 * "go to /login" that rendering order could decide.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useCurrentUser();
  const location = useLocation();

  // Remember whether this page has shown a signed-in user. Updating state
  // while rendering is fine here: React's documented pattern for "storing
  // information from previous renders", guarded so it runs only once.
  const [sawUser, setSawUser] = useState(false);
  if (user && !sawUser) setSawUser(true);

  if (isLoading) {
    return (
      <p role="status" className="text-slate-500">
        Loading…
      </p>
    );
  }
  if (!user) {
    return sawUser ? (
      <Navigate to="/" replace />
    ) : (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }
  return children;
}
