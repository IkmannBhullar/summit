// Types for our environment variables. Vite types every import.meta.env
// value as `any` unless it's declared here, which would let typos slip by.
interface ImportMetaEnv {
  /** Base URL of the Summit API; empty means "same origin" (see .env.example). */
  readonly VITE_API_URL?: string;
}
