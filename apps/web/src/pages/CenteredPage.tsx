import { Outlet } from "react-router";

/** Layout for small single-purpose pages (sign in, account): one centered column. */
export function CenteredPage() {
  return (
    <main className="flex flex-1 justify-center px-6 pt-8 pb-[max(4rem,env(safe-area-inset-bottom))]">
      <Outlet />
    </main>
  );
}
