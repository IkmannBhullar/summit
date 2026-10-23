// Types for our environment variables. Vite types every import.meta.env
// value as `any` unless it's declared here, which would let typos slip by.
interface ImportMetaEnv {
  /** Base URL of the Summit API; empty means "same origin" (see .env.example). */
  readonly VITE_API_URL?: string;
  /** Which Socket.io transports to use, e.g. "polling" behind a proxy without WebSockets. */
  readonly VITE_REALTIME_TRANSPORTS?: string;
}
