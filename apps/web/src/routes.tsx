/**
 * The app's pages and their URLs.
 *
 *   /              the timer (works for guests)
 *   /login         sign in
 *   /register      create an account
 *   /account       profile and sign out (signed-in users only)
 *   /rooms         start or join a rope team (signed-in users only)
 *   /rooms/:code   a rope team room; the link is the invite (signed-in users only)
 *   /stats         streaks, a year heatmap, time of day, time per tag (guests see a sign-in prompt)
 *
 * Every page renders inside AppLayout (header + dialogs). The auth pages
 * also share CenteredPage, a simple centered column.
 *
 * The rope team pages are loaded on demand (see pages/lazyPages.tsx).
 */
import type { RouteObject } from "react-router";
import { AppLayout } from "./AppLayout";
import { AccountPage } from "./features/auth/AccountPage";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { StatsPage } from "./features/stats/StatsPage";
import { CenteredPage } from "./pages/CenteredPage";
import { LazyRoomPage, LazyRoomsPage } from "./pages/lazyPages";
import { TimerPage } from "./pages/TimerPage";

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <TimerPage /> },
      { path: "stats", element: <StatsPage /> },
      {
        // A guest opening an invite link signs in first, then comes straight back.
        path: "rooms/:code",
        element: <LazyRoomPage />,
      },
      {
        element: <CenteredPage />,
        children: [
          { path: "login", element: <LoginPage /> },
          { path: "register", element: <RegisterPage /> },
          {
            path: "account",
            element: (
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            ),
          },
          {
            path: "rooms",
            element: <LazyRoomsPage />,
          },
        ],
      },
    ],
  },
];
