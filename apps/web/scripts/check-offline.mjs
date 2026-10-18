// End-to-end check that the production build is installable and works offline.
//
// Usage (after `npm run build -w apps/web`):
//   npm run check:offline -w apps/web
//
// It serves dist/ with Vite's preview server, drives a throwaway headless
// Chrome (temporary profile) over the Chrome DevTools Protocol, waits for the
// service worker, asks Chrome whether the app is installable, then stops the
// server, cuts the network, and reloads. Exits with code 1 if anything fails.
//
// Needs a local Chrome. Set CHROME_PATH if it isn't in the default macOS spot.
// Not part of CI yet (CI machines would need Chrome); Phase 4 can add that.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW_PORT = 4174;
const DEBUG_PORT = 9333;
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!existsSync(join(APP_DIR, "dist", "sw.js"))) {
  console.error("No production build found. Run `npm run build -w apps/web` first.");
  process.exit(1);
}
if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Set CHROME_PATH to your Chrome binary.`);
  process.exit(1);
}

/** Each check: a description and whether it passed. */
const checks = [];
const check = (description, passed, detail = "") =>
  checks.push({ description, passed: Boolean(passed), detail });

const server = await preview({ root: APP_DIR, preview: { port: PREVIEW_PORT, strictPort: true } });
const appUrl = `http://localhost:${PREVIEW_PORT}/`;
const profile = mkdtempSync(join(tmpdir(), "summit-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank",
]);
let serverClosed = false;

try {
  const cdp = await connectToChrome();

  // 1. Online: load the app and let the service worker install and precache.
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Page.navigate", { url: appUrl });
  // Wait for real conditions, never a fixed delay: the page renders, then the
  // service worker activates and takes control (fixed sleeps made this flaky).
  await cdp.waitFor(`!!document.querySelector("[role=timer]")`);
  await cdp.waitFor(`navigator.serviceWorker.ready.then(r => r.active?.state === "activated")`);
  const online = await cdp.evaluate(`(async () => {
    const registration = await navigator.serviceWorker.ready;
    const [cacheName] = await caches.keys();
    const cachedFiles = cacheName ? (await (await caches.open(cacheName)).keys()).length : 0;
    return { state: registration.active?.state, cachedFiles };
  })()`);
  check("Service worker activates", online?.state === "activated", online?.state);
  check("App files are precached", online?.cachedFiles > 0, `${online?.cachedFiles} files`);

  // 2. Chrome's own verdict on the manifest and installability.
  const manifest = await cdp.send("Page.getAppManifest");
  check("Manifest has no errors", manifest.errors?.length === 0, JSON.stringify(manifest.errors));
  const installability = await cdp.send("Page.getInstallabilityErrors");
  check(
    "Chrome reports the app as installable",
    installability.installabilityErrors?.length === 0,
    JSON.stringify(installability.installabilityErrors),
  );

  // 3. Go offline for real: stop the server AND cut the network.
  await server.close();
  serverClosed = true;
  await cdp.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });

  // 4. Reload with nothing to talk to. A normal reload, like a real user's:
  // a hard reload (ignoreCache) deliberately bypasses the service worker.
  await cdp.send("Page.reload");
  await cdp.waitFor(`document.querySelector("[role=timer]")?.textContent === "25:00"`);
  const offline = await cdp.evaluate(`({
    page: location.href + " | " + (document.body?.innerText.slice(0, 60) ?? ""),
    clock: document.querySelector("[role=timer]")?.textContent,
    startButton: [...document.querySelectorAll("button")].some(b => b.textContent === "Start focus"),
    mountain: !!document.querySelector("svg[role=img]"),
  })`);
  check("Timer loads offline", offline?.clock === "25:00", offline?.clock ?? offline?.page);
  check("Start button works offline", offline?.startButton);
  check("Mountain view loads offline", offline?.mountain);

  // 5. Deep links fall back to the app shell.
  await cdp.send("Page.navigate", { url: `${appUrl}some/deep/link` });
  await cdp.waitFor(
    `location.pathname === "/some/deep/link" && !!document.querySelector("[role=timer]")`,
  );
  const deepLink = await cdp.evaluate(
    `document.querySelector("[role=timer]")?.textContent ?? null`,
  );
  check("Deep links load offline", deepLink === "25:00", deepLink);

  cdp.close();
} catch (error) {
  check("Check ran to completion", false, error instanceof Error ? error.message : String(error));
} finally {
  chrome.kill();
  if (!serverClosed) await server.close();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

for (const { description, passed, detail } of checks) {
  console.log(`${passed ? "✔" : "✘"} ${description}${detail ? ` (${detail})` : ""}`);
}
const failed = checks.filter((c) => !c.passed).length;
console.log(failed === 0 ? "\nAll offline checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);

/** Connects to the headless Chrome tab and returns a tiny CDP client. */
async function connectToChrome() {
  let targets;
  for (let attempt = 0; attempt < 50 && !targets; attempt++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)
      .then((response) => response.json())
      .catch(() => undefined);
  }
  const page = targets?.find((target) => target.type === "page");
  if (!page) throw new Error("Couldn't connect to headless Chrome");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

  // Every command gets an id; Chrome echoes it back with the result.
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data.result ?? { error: data.error });
      pending.delete(data.id);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result
      ?.value;

  /**
   * Re-checks `expression` in the page every 200 ms until it's true, or gives
   * up after `timeoutMs`. Evaluating during a navigation can fail (the old
   * page is gone), so errors just mean "not yet".
   */
  const waitFor = async (expression, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(200);
    }
    // Don't throw: the checks that follow will fail with useful details.
  };

  return { send, evaluate, waitFor, close: () => socket.close() };
}
