/**
 * Typed, validated access to localStorage.
 *
 * localStorage is *untrusted input*: it can hold data saved by an older
 * version of the app, be corrupted, be edited by hand in DevTools, or be
 * unavailable entirely (some private-browsing modes throw on access). So:
 * - every read is checked against a schema, falling back to a safe default
 * - no read or write ever throws into the UI
 */

/** All our keys share a prefix so they never collide with other apps on the same origin. */
const KEY_PREFIX = "summit:";

/**
 * Anything with a Zod-style `safeParse`. Describing just the shape we need
 * (instead of importing Zod's types) keeps the web app from depending on Zod
 * directly; it only uses the schemas exported by @summit/shared.
 */
export interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

/**
 * Reads and validates a stored value.
 *
 * @returns The stored value if it exists and passes the schema; otherwise `fallback`.
 */
export function loadFromStorage<T>(key: string, schema: Schema<T>, fallback: T): T {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY_PREFIX + key);
  } catch {
    return fallback; // storage blocked (e.g. some private modes)
  }
  if (raw === null) return fallback; // nothing saved yet

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.warn(`Ignoring corrupted saved data for "${key}"`);
    return fallback;
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    console.warn(`Ignoring invalid saved data for "${key}"`);
    return fallback;
  }
  return result.data;
}

/**
 * Saves a value as JSON.
 *
 * @returns false if it couldn't be saved (storage full or blocked), so callers
 *   can warn the user if it matters. Never throws.
 */
export function saveToStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
