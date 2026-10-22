/**
 * The signed-in user, remembered on this device.
 *
 * Two jobs:
 * - On startup, signed-in users get a brief "Loading…" instead of a flash of
 *   guest data, while guests still see the timer instantly.
 * - When the server can't be reached (offline, or asleep on free hosting),
 *   the app carries on as this user: the timer stays in account mode, and
 *   finished sessions wait in their outbox until the server answers again.
 *
 * Only the public profile is kept (id, name, email, sign-up date), never a
 * password or the login token (that stays in its httpOnly cookie, which page
 * JavaScript can't read). It's cleared on sign-out, and whenever the server
 * says nobody is signed in.
 */
import { UserSchema, type User } from "@summit/shared";
import { loadFromStorage, saveToStorage } from "../../lib/storage";

const KEY = "signed-in-user";
/** What earlier versions stored: just "1", without saying who. */
const OLD_HINT_KEY = "summit:signed-in-hint";

/** Who was signed in on this device last, or null. Checked against the shared schema. */
export function rememberedUser(): User | null {
  return loadFromStorage(KEY, UserSchema.nullable(), null);
}

/** Remembers the signed-in user, or forgets them (null). */
export function rememberUser(user: User | null): void {
  saveToStorage(KEY, user);
  try {
    localStorage.removeItem(OLD_HINT_KEY); // superseded by this
  } catch {
    // Storage blocked: nothing to clean up.
  }
}
