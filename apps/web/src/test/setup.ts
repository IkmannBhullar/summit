// Test setup, loaded before every web test file (see vite.config.ts → test.setupFiles).
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Adds DOM-specific matchers like toBeInTheDocument() and toHaveTextContent()
// to Vitest's expect().
import "@testing-library/jest-dom/vitest";

// Unmount anything rendered during a test so the next test starts with an
// empty page. (RTL only does this automatically when test globals are on.)
afterEach(() => {
  cleanup();
});
