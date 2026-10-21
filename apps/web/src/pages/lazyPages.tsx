/**
 * The rope team pages, loaded on demand.
 *
 * They bring the live-connection library (socket.io-client), which most
 * visits never need, so Vite puts them in their own files and the browser
 * fetches them the first time someone opens a room. They sit inside
 * RequireAuth, so guests never download them at all.
 */
import { lazy, Suspense, type ReactNode } from "react";
import { RequireAuth } from "../features/auth/RequireAuth";

// import() is what tells Vite to split the page out. React.lazy wants a
// default export, so pick the named one out of the module.
const RoomPage = lazy(() =>
  import("../features/rooms/RoomPage").then((m) => ({ default: m.RoomPage })),
);
const RoomsPage = lazy(() =>
  import("../features/rooms/RoomsPage").then((m) => ({ default: m.RoomsPage })),
);

/** Signed-in only, showing "Loading…" while the page's code downloads. */
function SignedInLazyPage({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <p role="status" className="px-6 pt-16 text-center text-slate-500">
            Loading…
          </p>
        }
      >
        {children}
      </Suspense>
    </RequireAuth>
  );
}

/** /rooms/:code */
export function LazyRoomPage() {
  return (
    <SignedInLazyPage>
      <RoomPage />
    </SignedInLazyPage>
  );
}

/** /rooms */
export function LazyRoomsPage() {
  return (
    <SignedInLazyPage>
      <RoomsPage />
    </SignedInLazyPage>
  );
}
