import { QueryClientProvider } from "@tanstack/react-query";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { createQueryClient } from "./lib/queryClient";
import { routes } from "./routes";

/**
 * The app root: app-wide providers, then the router (see routes.tsx).
 *
 * The router and query cache are created once per App (useState's
 * initializer runs only on the first render), so each test that renders
 * <App /> gets a fresh, independent instance.
 */
export default function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => createBrowserRouter(routes));

  return (
    <QueryClientProvider client={queryClient}>
      {/* LazyMotion + the lightweight `m` components load only the animation
          features we use (domAnimation), about 12 kB gzipped less than the
          full `motion` components. `strict` throws if a full `motion.*`
          sneaks back in. reducedMotion="user": Motion skips movement
          animations for people whose operating system is set to "reduce motion". */}
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          <RouterProvider router={router} />
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}
