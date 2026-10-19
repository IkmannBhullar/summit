/**
 * The app's pages and their URLs.
 *
 *   /           the timer (works for guests)
 *   /login      sign in
 *   /register   create an account
 *   /account    profile and sign out (signed-in users only)
 *
 * Every page renders inside AppLayout (header + dialogs). The auth pages
 * also share CenteredPage, a simple centered column.
 */
import type { RouteObject } from "react-router";
import { AppLayout } from "./AppLayout";
import { AccountPage } from "./features/auth/AccountPage";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { CenteredPage } from "./pages/CenteredPage";
import { TimerPage } from "./pages/TimerPage";

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <TimerPage /> },
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
        ],
      },
    ],
  },
];
