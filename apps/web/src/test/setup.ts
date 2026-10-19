// Test setup, loaded before every web test file (see vite.config.ts → test.setupFiles).
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

// Adds DOM-specific matchers like toBeInTheDocument() and toHaveTextContent()
// to Vitest's expect().
import "@testing-library/jest-dom/vitest";

// The fake API (see server.ts). "error" for unhandled requests ("frames" in
// MSW 3, which also covers WebSockets) means any
// fetch a test didn't plan for fails loudly instead of hitting a real network.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  // Unmount anything rendered during a test so the next test starts with an
  // empty page. (RTL only does this automatically when test globals are on.)
  cleanup();
  // Start every test with empty storage so saved data can't leak between tests.
  localStorage.clear();
  // Remove handlers added by individual tests, back to "everyone is a guest".
  server.resetHandlers();
  // Each test starts at the home page.
  window.history.replaceState(null, "", "/");
});

afterAll(() => {
  server.close();
});

// jsdom (our fake browser) doesn't implement <dialog>'s showModal() and
// close(). These stand-ins toggle the `open` attribute and fire the `close`
// event like a real browser. They can't imitate focus trapping or the Esc
// key; those are checked in a real browser.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
