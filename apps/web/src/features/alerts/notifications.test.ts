// Tests for the notification helpers, with a fake Notification API
// (jsdom doesn't have one).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notificationStatus,
  requestNotificationPermission,
  showNotification,
} from "./notifications";

/** Installs a fake global Notification with the given permission. */
function installFakeNotification(permission: NotificationPermission) {
  const constructed: { title: string; options?: NotificationOptions }[] = [];
  const FakeNotification = vi.fn(function (title: string, options?: NotificationOptions) {
    constructed.push({ title, options });
  }) as unknown as typeof Notification & { permission: NotificationPermission };
  Object.assign(FakeNotification, {
    permission,
    requestPermission: vi.fn(() => Promise.resolve("granted" as const)),
  });
  vi.stubGlobal("Notification", FakeNotification);
  return { constructed, FakeNotification };
}

/** Pretends the page is hidden or visible. */
function setVisibility(visibility: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: visibility });
}

beforeEach(() => {
  setVisibility("hidden");
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "visibilityState");
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("notificationStatus", () => {
  it("reports 'unsupported' when the browser has no Notification API", () => {
    vi.stubGlobal("Notification", undefined);

    expect(notificationStatus()).toBe("unsupported");
  });

  it("reports the browser's permission", () => {
    installFakeNotification("denied");

    expect(notificationStatus()).toBe("denied");
  });
});

describe("requestNotificationPermission", () => {
  it("returns the user's answer", async () => {
    installFakeNotification("default");

    await expect(requestNotificationPermission()).resolves.toBe("granted");
  });
});

describe("showNotification", () => {
  it("shows a tagged notification when granted and the page is hidden", async () => {
    const { constructed } = installFakeNotification("granted");

    await showNotification("Session complete", "+250 m");

    expect(constructed).toEqual([
      {
        title: "Session complete",
        options: { body: "+250 m", icon: "/favicon.svg", tag: "summit-timer" },
      },
    ]);
  });

  it("stays quiet while the user is looking at the page", async () => {
    const { constructed } = installFakeNotification("granted");
    setVisibility("visible");

    await showNotification("Session complete", "+250 m");

    expect(constructed).toHaveLength(0);
  });

  it.each<NotificationPermission>(["default", "denied"])(
    "does nothing when permission is %s",
    async (permission) => {
      const { constructed } = installFakeNotification(permission);

      await showNotification("Session complete", "+250 m");

      expect(constructed).toHaveLength(0);
    },
  );

  // Required on Android, where `new Notification()` throws.
  it("uses the service worker when one is registered", async () => {
    const { constructed } = installFakeNotification("granted");
    const showViaWorker = vi.fn(async () => {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: () => Promise.resolve({ showNotification: showViaWorker }) },
    });

    await showNotification("Session complete", "+250 m");

    expect(showViaWorker).toHaveBeenCalledWith("Session complete", expect.anything());
    expect(constructed).toHaveLength(0);
  });

  it("never throws, even if showing fails", async () => {
    const { FakeNotification } = installFakeNotification("granted");
    vi.mocked(FakeNotification).mockImplementation(() => {
      throw new TypeError("Illegal constructor");
    });

    await expect(showNotification("Session complete", "+250 m")).resolves.toBeUndefined();
  });
});
