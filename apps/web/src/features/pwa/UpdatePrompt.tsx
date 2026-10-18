// "virtual:" modules don't exist on disk: vite-plugin-pwa generates this one
// at build time with the code that registers our service worker.
import { useRegisterSW } from "virtual:pwa-register/react";
import { UpdateBanner } from "./UpdateBanner";

/**
 * Registers the service worker and shows a banner when the app is ready
 * offline or when a new version is waiting.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <UpdateBanner
      needRefresh={needRefresh}
      offlineReady={offlineReady}
      // Activate the waiting service worker, then reload into the new version.
      onReload={() => void updateServiceWorker(true)}
      onClose={() => {
        setNeedRefresh(false);
        setOfflineReady(false);
      }}
    />
  );
}
