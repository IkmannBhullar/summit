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
 * Anything with a Zod-style `safeParse`. Describing just the shape we need,
 * instead of requiring a Zod type, keeps these helpers independent of the
 * validation library: any object with this method works, which also makes
 * them easy to test.
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
 * Reads a stored list, validating each item separately.
 *
 * Unlike `loadFromStorage`, one bad entry doesn't throw away the whole list:
 * a single corrupted session shouldn't erase months of history. Invalid
 * items are dropped (with a warning) and the rest are kept.
 *
 * @returns The valid items, or an empty list if nothing usable is stored.
 */
export function loadListFromStorage<T>(key: string, itemSchema: Schema<T>): T[] {
  const stored = loadFromStorage<unknown[]>(key, { safeParse: parseArray }, []);

  const valid: T[] = [];
  for (const item of stored) {
    const result = itemSchema.safeParse(item);
    if (result.success) valid.push(result.data);
  }
  if (valid.length < stored.length) {
    console.warn(`Dropped ${stored.length - valid.length} invalid item(s) from "${key}"`);
  }
  return valid;
}

/** A minimal schema that accepts any array (items are checked one by one afterwards). */
function parseArray(input: unknown): { success: true; data: unknown[] } | { success: false } {
  return Array.isArray(input) ? { success: true, data: input as unknown[] } : { success: false };
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
